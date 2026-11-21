import mongoose, { Types } from "mongoose";
import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";
import { down, up } from "../../../migrations/1796100000000-xennote-notebooks-to-pages";
import {
  down as reverseContract,
  up as contract,
} from "../../../migrations/1796300000000-xennote-contract-notebook-notes";
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

    expect((await api("get", `/pages/${id}`, owner)).status).toBe(200);
    expect((await api("get", `/pages/${id}`, guest)).status).toBe(404);
    expect((await api("get", `/pages/${id}`, stranger)).status).toBe(404);
    expect((await api("get", `/public/page/${token}`, owner)).status).toBe(404);
    expect((await api("get", `/shared/page/${token}`, guest)).status).toBe(404);
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
    expect(await all.collection("xennotes").findOne({ _id: loose })).not.toBeNull();
  }, 120_000);

  it("drops legacy data after cutover and keeps the notebook pages and loose notes intact", async () => {
    const [owner, viewer] = await Promise.all([createUser(), createUser()]);
    const all = mongoose.connection;
    const notes = all.collection("xennotes");
    const books = all.collection("xennotebooks");
    const versions = all.collection("xennoteversions");
    const pages = all.collection("xennotepages");
    const bodies = all.collection("xennotepagebodies");
    const pageVersions = all.collection("xennotepageversions");
    const book = new Types.ObjectId();
    const legacy = new Types.ObjectId();
    const loose = new Types.ObjectId();
    const blocked = new Types.ObjectId();
    const pageToken = "c".repeat(22);
    const noteToken = "d".repeat(22);
    const bookToken = "e".repeat(22);
    const at = new Date();
    const ownerId = owner.user.id;

    await books.insertOne({
      _id: book,
      name: "Cleanup",
      members: [{ user_id: ownerId, role: "owner" }],
      share: { enabled: true, token: bookToken },
    });
    await notes.insertMany([
      {
        _id: legacy,
        owner_id: ownerId,
        notebook_id: book,
        title: "Migrated",
        share: { enabled: true, token: pageToken },
      },
      { _id: loose, owner_id: ownerId, notebook_id: null, title: "Loose", share: { enabled: true, token: noteToken } },
    ]);
    await notes.createIndex({ notebook_id: 1, updated_at: -1 });
    await notes.createIndex({ owner_id: 1, notebook_id: 1 });
    const migratedHistory = new Types.ObjectId();
    const looseHistory = new Types.ObjectId();
    await versions.insertMany([
      { _id: migratedHistory, note_id: legacy, title: "Before", at, captured_at: at },
      { _id: looseHistory, note_id: loose, title: "Loose before", at, captured_at: at },
    ]);

    await expect(contract(all)).rejects.toThrow("must be migrated");
    await up(all);
    const body = await bodies.findOne({ page_id: legacy });

    await notes.insertOne({ _id: blocked, owner_id: ownerId, notebook_id: book, deleted_at: at });
    await expect(contract(all)).rejects.toThrow("have not been migrated");
    expect(await all.collection("xennotes_premigration").findOne({ _id: legacy })).not.toBeNull();
    expect(await versions.findOne({ _id: migratedHistory })).not.toBeNull();
    await notes.deleteOne({ _id: blocked });

    await contract(all);
    await contract(all);
    await expect(reverseContract()).rejects.toThrow("irreversible");
    await expect(down(all)).rejects.toThrow("cleanup has already started");
    expect(await all.db!.listCollections({ name: "xennotes_premigration" }).hasNext()).toBe(false);
    const indexes = (await notes.listIndexes().toArray()).map((index) => index.name);
    expect(indexes).not.toContain("notebook_id_1_updated_at_-1");
    expect(indexes).not.toContain("owner_id_1_notebook_id_1");
    expect(await notes.findOne({ _id: loose })).toMatchObject({ title: "Loose" });
    expect((await notes.findOne({ _id: loose }))?.notebook_id).toBeUndefined();
    expect(await versions.findOne({ _id: migratedHistory })).toBeNull();
    expect(await versions.findOne({ _id: looseHistory })).not.toBeNull();
    expect((await books.findOne({ _id: book }))?.pages_migrated_at).toBeUndefined();
    expect((await books.findOne({ _id: book }))?.notes_migration_section_id).toBeUndefined();
    expect((await pages.findOne({ _id: legacy }))?.migrated_from_note).toBeUndefined();
    expect(await bodies.findOne({ page_id: legacy })).toEqual(body);
    const history = await pageVersions.findOne({ _id: migratedHistory });
    expect(history).toMatchObject({ page_id: legacy, title: "Before" });
    expect(history?.migrated_from_note).toBeUndefined();

    expect((await api("get", `/locate/${legacy}`, owner)).status).toBe(404);
    expect((await api("get", `/notes/${legacy}`, owner)).status).toBe(404);
    expect((await api("get", `/notes?notebook=${book}`, owner)).status).toBe(400);
    expect((await api("post", "/notes", owner).send({ notebook_id: String(book) })).status).toBe(400);
    expect((await api("put", `/notes/${loose}`, owner).send({ notebook_id: String(book) })).status).toBe(400);
    expect(
      (await api("post", "/notes/bulk-update", owner).send({ ids: [String(loose)], notebook_id: null })).status,
    ).toBe(400);
    expect((await api("get", `/public/note/${pageToken}`)).status).toBe(404);
    expect((await api("get", `/shared/note/${pageToken}`, owner)).status).toBe(404);
    expect((await api("get", `/public/page/${pageToken}`, owner)).status).toBe(404);
    expect((await api("get", `/public/note/${noteToken}`)).body.data.note.title).toBe("Loose");
    expect((await api("get", `/shared/note/${noteToken}`, viewer)).body.data.access).toBe("link");
    const notebook = (await api("get", `/public/notebook/${bookToken}`)).body.data;
    expect(notebook.pages).toEqual([expect.objectContaining({ id: String(legacy) })]);
    expect(notebook.notes).toBeUndefined();
  }, 120_000);
});
