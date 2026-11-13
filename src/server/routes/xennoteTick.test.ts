import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Ticking one checklist item of a note: set (not toggle), atomic, and safe to send twice. Real routes and models.
vi.hoisted(() => {
  process.env.GCS_PUBLIC_BUCKET_NAME = "test-public";
  process.env.GCS_PRIVATE_BUCKET_NAME = "test-private";
});
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  generateSignedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xennote/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xennote${url}`).set(as(who)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xennote${url}`).set(as(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xennote${url}`).set(as(who)).send(body),
});
const list = async (who: U, items = ["milk", "eggs", "bread"], extra: object = {}) => {
  const res = await api(who).post("/notes", {
    type: "checklist",
    title: "Shopping",
    checklist: items.map((text) => ({ text, done: false })),
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.note as { _id: string; checklist: Array<{ _id: string; text: string; done: boolean }> };
};
const tick = (who: U, noteId: string, itemId: string, done: boolean) =>
  api(who).put(`/notes/${noteId}/checklist/${itemId}`, { done });
const done = async (who: U, id: string) =>
  (await api(who).get(`/notes/${id}`)).body.data.note.checklist.map((c: any) => c.done);

describe("ticking one checklist item", () => {
  it("sets the item and leaves the others as they were", async () => {
    const me = await createUser();
    const n = await list(me);
    const res = await tick(me, n._id, n.checklist[1]._id, true);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.note.checklist.map((c: any) => [c.text, c.done])).toEqual([
      ["milk", false],
      ["eggs", true],
      ["bread", false],
    ]);
    await tick(me, n._id, n.checklist[1]._id, false);
    expect(await done(me, n._id)).toEqual([false, false, false]);
  });

  it("is a set, not a toggle: sending the same tick twice gives the same result", async () => {
    const me = await createUser();
    const n = await list(me);
    for (let i = 0; i < 3; i++) await tick(me, n._id, n.checklist[0]._id, true);
    expect(await done(me, n._id)).toEqual([true, false, false]);
  });

  it("doesn't undo what someone else ticked in the meantime, and doesn't lose simultaneous ticks", async () => {
    const [owner, editor] = await Promise.all([createUser(), createUser()]);
    const book = (await api(owner).post("/notebooks", { name: "Home" })).body.data.notebook;
    const added = await api(owner).post(`/notebooks/${book._id}/members`, {
      userIds: [String(editor.user._id)],
      role: "editor",
    });
    expect(added.status).toBe(200);
    const n = await list(owner, ["a", "b", "c", "d"], { notebook_id: book._id });
    await Promise.all([
      tick(owner, n._id, n.checklist[0]._id, true),
      tick(editor, n._id, n.checklist[1]._id, true),
      tick(owner, n._id, n.checklist[2]._id, true),
    ]);
    expect(await done(owner, n._id)).toEqual([true, true, true, false]);
  });

  it("moves the note to the top of the board like any change, and records who", async () => {
    const me = await createUser();
    const first = await list(me, ["x"]);
    await list(me, ["y"], { title: "Newer" });
    await tick(me, first._id, first.checklist[0]._id, true);
    const titles = (await api(me).get("/notes")).body.data.notes.map((x: any) => x.title);
    expect(titles[0]).toBe("Shopping");
  });

  it("refuses an item that isn't on the note (a different note's, or deleted), and a note that isn't a checklist", async () => {
    const me = await createUser();
    const a = await list(me);
    const b = await list(me, ["other"]);
    expect((await tick(me, a._id, b.checklist[0]._id, true)).status).toBe(404);
    expect((await tick(me, a._id, new mongoose.Types.ObjectId().toString(), true)).status).toBe(404);
    const text = (await api(me).post("/notes", { type: "text", body: "hi" })).body.data.note;
    expect((await tick(me, text._id, a.checklist[0]._id, true)).status).toBe(404);
    expect(await done(me, a._id)).toEqual([false, false, false]);
  });

  it("is for people who can edit: a viewer, a stranger and a signed-out caller are refused", async () => {
    const [owner, viewer, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
    const book = (await api(owner).post("/notebooks", { name: "Home" })).body.data.notebook;
    await api(owner).post(`/notebooks/${book._id}/members`, { userIds: [String(viewer.user._id)], role: "viewer" });
    const n = await list(owner, ["a"], { notebook_id: book._id });
    expect((await tick(viewer, n._id, n.checklist[0]._id, true)).status).toBe(403);
    expect((await tick(stranger, n._id, n.checklist[0]._id, true)).status).toBe(404);
    expect(
      (await request(t.app).put(`/api/xennote/notes/${n._id}/checklist/${n.checklist[0]._id}`).send({ done: true }))
        .status,
    ).toBe(401);
    expect(
      (await api(owner).put(`/notes/${n._id}/checklist/${n.checklist[0]._id}`, { done: "yes" as any })).status,
    ).toBe(400);
    expect(await done(owner, n._id)).toEqual([false]);
  });
});
