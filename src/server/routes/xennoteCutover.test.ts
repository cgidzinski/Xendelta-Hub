import mongoose, { Types } from "mongoose";
import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";
import { down, up } from "../../../migrations/1796100000000-xennote-notebooks-to-pages";
import { runNoteReminders } from "../utils/xenNoteReminders";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp([() => import("./xennote/index.js")]);
}, 120_000);
afterAll(async () => {
  await app?.stop();
}, 45_000);

type User = Awaited<ReturnType<typeof createUser>>;
const api = (method: "get" | "post" | "put", path: string, user?: User) => {
  const call = request(app.app)[method](`/api/xennote${path}`);
  return user ? call.auth(user.token, { type: "bearer" }) : call;
};

describe("XenNote notebook cutover", () => {
  it("converts notes in place, preserves access and links, reruns and rolls back", async () => {
    const [owner, guest, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
    const all = mongoose.connection;
    const book = new Types.ObjectId();
    const loose = new Types.ObjectId();
    const id = new Types.ObjectId();
    const target = new Types.ObjectId();
    const photo = new Types.ObjectId();
    const history = new Types.ObjectId();
    const existing = new Types.ObjectId();
    const foreign = new Types.ObjectId();
    const token = "a".repeat(22);
    const at = new Date();
    const prior = {
      _id: id,
      notebook_id: book,
      owner_id: owner.user.id,
      type: "image",
      title: "Photos",
      body: "Review [[Checklist]].",
      labels: ["Trip Prep"],
      color: "green",
      pinned: true,
      reminders: [{ user_id: owner.user.id, at, notified_at: null }],
      members: [{ user_id: guest.user.id, role: "viewer" }],
      share: { enabled: true, token },
      images: [{ file_id: photo }, { file_id: foreign }],
      created_at: at,
      updated_at: at,
    };
    const notebookShare = "b".repeat(22);
    await all.collection("xennotebooks").insertOne({
      _id: book,
      name: "Trip",
      members: [{ user_id: owner.user.id, role: "owner" }],
      share: { enabled: true, token: notebookShare },
    });
    await all.collection("xennotesections").insertOne({
      _id: existing,
      name: "Projects",
      notebook_id: book,
      kind: "normal",
      order: "a0",
    });
    await all.collection("xennotes").insertMany([
      prior,
      {
        _id: target,
        notebook_id: book,
        owner_id: owner.user.id,
        type: "checklist",
        title: "Checklist",
        checklist: [{ text: "Pack", done: true }],
      },
      { _id: loose, owner_id: owner.user.id, type: "text", title: "Loose" },
    ]);
    await all.collection("filerecords").insertMany([
      { _id: photo, bucket: "private", key: "trip.jpg", space: { app: "xennote", ref: String(id) } },
      { _id: foreign, bucket: "private", key: "foreign.jpg", space: { app: "xennote", ref: "someone-else" } },
    ]);
    await all.collection("xennoteversions").insertOne({
      _id: history,
      note_id: id,
      type: "text",
      body: "Earlier",
      at,
      captured_at: at,
    });

    await up(all);
    const page = await all.collection("xennotepages").findOne({ _id: id });
    const body = await all.collection("xennotepagebodies").findOne({ page_id: id });
    expect(page).toMatchObject({
      migrated_from_note: true,
      notebook_id: book,
      title: "Photos",
      tags: ["trip-prep"],
      favorited_by: [owner.user.id],
      files: [photo],
      links: [target],
      reminders: prior.reminders,
    });
    expect((await all.collection("xennotepages").findOne({ _id: target }))?.todo).toEqual({ open: 0, done: 1 });
    expect(await all.collection("xennotepageversions").findOne({ _id: history })).toMatchObject({ page_id: id });
    expect(await all.collection("xennotes_premigration").findOne({ _id: id })).toMatchObject(prior);
    expect(await all.collection("xennotes").countDocuments({ notebook_id: book })).toBe(0);

    await up(all);
    expect(await all.collection("xennotepagebodies").findOne({ page_id: id })).toEqual(body);
    expect(await all.collection("xennotesections").countDocuments({ notebook_id: book })).toBe(2);

    expect((await api("get", `/locate/${id}`, owner)).body.data).toEqual({
      kind: "page",
      id: String(id),
      notebook_id: String(book),
    });
    expect((await api("get", `/locate/${id}`, guest)).body.data.notebook_id).toBeNull();
    expect((await api("get", `/locate/${id}`, stranger)).status).toBe(404);
    expect((await api("get", `/locate/${loose}`, owner)).body.data.kind).toBe("note");
    expect((await api("get", `/notes/${id}`, owner)).status).toBe(410);
    expect((await api("get", `/notes/${id}`, stranger)).status).toBe(404);
    expect((await api("get", `/notes?notebook=${book}`, owner)).status).toBe(410);
    expect(
      (await api("post", "/notes", owner).send({ title: "Old client", notebook_id: String(book), type: "text" }))
        .status,
    ).toBe(410);
    expect((await api("get", `/public/note/${token}`)).body.data.page_id).toBe(String(id));
    expect((await api("get", `/shared/note/${token}`, guest)).body.data).toMatchObject({
      access: "member",
      role: "viewer",
      page_id: String(id),
      notebook_id: null,
    });
    expect((await api("get", `/public/notebook/${notebookShare}`)).body.data.pages).toHaveLength(2);

    const future = new Date(Date.now() + 120_000);
    expect((await api("put", `/pages/${target}/reminder`, stranger).send({ at: future })).status).toBe(404);
    const reminder = await api("put", `/pages/${target}/reminder`, owner).send({ at: future });
    expect(reminder.body.data).toEqual({ reminder: { at: future.toISOString(), sent: false } });
    const due = new Date(future.getTime() + 10);
    await Promise.all([runNoteReminders(due), runNoteReminders(due)]);
    const alerts = await all.collection("notifications").find({ userId: owner.user._id }).toArray();
    expect(alerts.map((notification) => notification.link)).toEqual(
      expect.arrayContaining([`/internal/xennote/p/${id}`, `/internal/xennote/p/${target}`]),
    );
    expect(alerts).toHaveLength(2);

    await down(all);
    await down(all);
    expect(await all.collection("xennotes").findOne({ _id: id })).toEqual(prior);
    expect(await all.collection("xennotepages").countDocuments({ notebook_id: book })).toBe(0);
    expect(await all.collection("xennotesections").countDocuments({ notebook_id: book })).toBe(1);
    expect(await all.collection("xennoteversions").findOne({ _id: history })).not.toBeNull();
    expect((await api("get", `/locate/${id}`, guest)).body.data.kind).toBe("note");
    expect(await all.collection("xennotes").findOne({ _id: loose })).not.toBeNull();
  }, 120_000);
});
