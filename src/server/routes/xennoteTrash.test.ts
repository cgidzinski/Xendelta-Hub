import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenNote } from "../models/xenNote";
import { purgeExpiredNotes } from "../utils/xenNoteTrash";
import { TRASH_MS } from "../utils/softDelete";

// Deleting a note moves it to the Trash for 30 days; it can be restored by whoever deleted it.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xennote/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const api = (who?: U) => {
  const h = (r: request.Test) => (who ? r.set({ Authorization: `Bearer ${who.token}` }) : r);
  return {
    get: (url: string) => h(request(t.app).get(`/api/xennote${url}`)),
    post: (url: string, body?: object) => h(request(t.app).post(`/api/xennote${url}`)).send(body),
    put: (url: string, body: object) => h(request(t.app).put(`/api/xennote${url}`)).send(body),
    del: (url: string) => h(request(t.app).delete(`/api/xennote${url}`)),
  };
};
const note = async (who: U, body: object = { type: "text", title: "Groceries", body: "milk" }) => {
  const r = await api(who).post("/notes", body);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.note as { _id: string };
};
const titles = async (who: U) => (await api(who).get("/notes")).body.data.notes.map((n: any) => n.title);
const trash = async (who: U) => (await api(who).get("/trash")).body.data.notes as any[];

describe("the note Trash", () => {
  it("hides a deleted note everywhere, and restoring brings it back as it was", async () => {
    const me = await createUser();
    const n = await note(me, { type: "text", title: "Keep me", body: "hello", pinned: true });
    expect((await api(me).del(`/notes/${n._id}`)).status).toBe(200);

    expect(await titles(me)).toEqual([]);
    expect((await api(me).get("/counts")).body.data.all).toBe(0);
    expect((await api(me).get(`/notes?q=hello`)).body.data.notes).toEqual([]);
    const listed = await trash(me);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ _id: n._id, title: "Keep me", preview: "hello" });
    expect(new Date(listed[0].purge_at).getTime() - new Date(listed[0].deleted_at).getTime()).toBe(TRASH_MS);

    expect((await api(me).post(`/trash/${n._id}/restore`)).status).toBe(200);
    expect(await titles(me)).toEqual(["Keep me"]);
    expect(await trash(me)).toEqual([]);
    expect((await api(me).get("/notes")).body.data.notes[0].pinned).toBe(true);
  });

  it("stops a shared link working while the note is in the Trash", async () => {
    const me = await createUser();
    const n = await note(me);
    const shared = await api(me).post(`/notes/${n._id}/share`);
    expect(shared.status, JSON.stringify(shared.body)).toBe(200);
    const token = shared.body.data.note.share.token;
    expect((await request(t.app).get(`/api/xennote/public/note/${token}`)).status).toBe(200);

    await api(me).del(`/notes/${n._id}`);
    expect((await request(t.app).get(`/api/xennote/public/note/${token}`)).status).toBe(404);
    await api(me).post(`/trash/${n._id}/restore`);
    expect((await request(t.app).get(`/api/xennote/public/note/${token}`)).status).toBe(200);
  });

  it("is private to whoever deleted the note", async () => {
    const me = await createUser();
    const other = await createUser();
    const n = await note(me);
    await api(me).del(`/notes/${n._id}`);
    expect(await trash(other)).toEqual([]);
    expect((await api(other).post(`/trash/${n._id}/restore`)).status).toBe(404);
    expect((await api(other).del(`/trash/${n._id}`)).status).toBe(404);
  });

  it("deletes one note, or empties the Trash, for good", async () => {
    const me = await createUser();
    const a = await note(me, { type: "text", title: "A" });
    const b = await note(me, { type: "text", title: "B" });
    const c = await note(me, { type: "text", title: "C" });
    for (const n of [a, b, c]) await api(me).del(`/notes/${n._id}`);

    expect((await api(me).del(`/trash/${a._id}`)).status).toBe(200);
    expect(await trash(me)).toHaveLength(2);
    // Not in the Trash any more, so it can't be restored or deleted again.
    expect((await api(me).post(`/trash/${a._id}/restore`)).status).toBe(404);

    const emptied = await api(me).del("/trash");
    expect(emptied.body.data.removed).toBe(2);
    expect(await trash(me)).toEqual([]);
    expect(await XenNote.countDocuments({ owner_id: String(me.user._id) }).setOptions({ includeDeleted: true })).toBe(
      0,
    );
  });

  it("removes notes after 30 days, and keeps newer ones", async () => {
    const me = await createUser();
    const old = await note(me, { type: "text", title: "Old" });
    const recent = await note(me, { type: "text", title: "Recent" });
    await api(me).del(`/notes/${old._id}`);
    await api(me).del(`/notes/${recent._id}`);
    await XenNote.updateOne({ _id: old._id }, { deleted_at: new Date(Date.now() - TRASH_MS - 60_000) }).setOptions({
      includeDeleted: true,
    });

    expect(await purgeExpiredNotes()).toBeGreaterThanOrEqual(1);
    expect((await trash(me)).map((n) => n.title)).toEqual(["Recent"]);
  });
});
