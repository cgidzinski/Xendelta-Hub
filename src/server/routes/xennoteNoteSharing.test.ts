import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Sharing one note with chosen people: what a viewer, an editor and a stranger can each do.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xennote/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => String(u.user._id);
const api = (who: U) => {
  const auth = { Authorization: `Bearer ${who.token}` };
  return {
    get: (url: string) => request(t.app).get(`/api/xennote${url}`).set(auth),
    post: (url: string, body?: object) => request(t.app).post(`/api/xennote${url}`).set(auth).send(body),
    put: (url: string, body?: object) => request(t.app).put(`/api/xennote${url}`).set(auth).send(body),
    del: (url: string) => request(t.app).delete(`/api/xennote${url}`).set(auth),
  };
};
const mkNote = async (who: U, body: object = {}) => {
  const r = await api(who).post("/notes", { type: "text", title: "Plan", body: "hello", ...body });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.note as { _id: string };
};
const share = (owner: U, noteId: string, to: U, role: "editor" | "viewer") =>
  api(owner).post(`/notes/${noteId}/members`, { userIds: [id(to)], role });

describe("sharing a note with people", () => {
  it("lets a viewer read it, under Shared with me, but not change, delete or re-share it", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const n = await mkNote(owner);
    expect((await api(viewer).get(`/notes/${n._id}`)).status).toBe(404); // private until shared

    const res = await share(owner, n._id, viewer, "viewer");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.members.map((m: any) => [m.user_id, m.role])).toEqual([[id(viewer), "viewer"]]);

    const seen = (await api(viewer).get(`/notes/${n._id}`)).body.data.note;
    expect(seen).toMatchObject({ title: "Plan", can_edit: false, shared_with: 1, share: null });
    expect(seen.owner_name).toBe(owner.user.username);

    const listed = (await api(viewer).get("/notes?scope=shared")).body.data.notes;
    expect(listed.map((x: any) => x._id)).toEqual([n._id]);
    expect((await api(viewer).get("/notes")).body.data.notes).toHaveLength(1); // also on All notes
    expect((await api(viewer).get("/notes?scope=mine")).body.data.notes).toHaveLength(0); // but not "My notes"
    expect((await api(viewer).get("/counts")).body.data).toMatchObject({ all: 1, mine: 0, shared: 1 });

    expect((await api(viewer).put(`/notes/${n._id}`, { title: "Mine now" })).status).toBe(403);
    expect((await api(viewer).del(`/notes/${n._id}`)).status).toBe(403);
    expect((await share(viewer, n._id, await createUser(), "viewer")).status).toBe(403);
    expect((await api(viewer).post(`/notes/${n._id}/share`)).status).toBe(403);
  });

  it("lets an editor change the wording, but not delete or share it", async () => {
    const owner = await createUser();
    const editor = await createUser();
    const n = await mkNote(owner);
    await share(owner, n._id, editor, "editor");

    const saved = await api(editor).put(`/notes/${n._id}`, { body: "edited by editor" });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.note.can_edit).toBe(true);
    expect((await api(owner).get(`/notes/${n._id}`)).body.data.note.body).toBe("edited by editor");

    expect((await api(editor).del(`/notes/${n._id}`)).status).toBe(403);
    expect((await api(editor).post("/notes/bulk-delete", { ids: [n._id] })).body.data).toMatchObject({ deleted: 0 });
    expect((await share(editor, n._id, await createUser(), "viewer")).status).toBe(403);
  });

  it("changes a role, and removing someone ends their access", async () => {
    const owner = await createUser();
    const other = await createUser();
    const n = await mkNote(owner);
    await share(owner, n._id, other, "viewer");

    await api(owner).put(`/notes/${n._id}/members/${id(other)}`, { role: "editor" });
    expect((await api(other).get(`/notes/${n._id}`)).body.data.note.can_edit).toBe(true);
    expect((await api(owner).put(`/notes/${n._id}/members/${id(other)}`, { role: "owner" })).status).toBe(400);

    const gone = await api(owner).del(`/notes/${n._id}/members/${id(other)}`);
    expect(gone.status).toBe(200);
    expect((await api(other).get(`/notes/${n._id}`)).status).toBe(404);
    expect((await api(other).get("/notes")).body.data.notes).toHaveLength(0);
  });

  it("lets someone leave a note shared with them, but not remove anyone else", async () => {
    const owner = await createUser();
    const a = await createUser();
    const b = await createUser();
    const n = await mkNote(owner);
    await share(owner, n._id, a, "viewer");
    await share(owner, n._id, b, "viewer");

    expect((await api(a).del(`/notes/${n._id}/members/${id(b)}`)).status).toBe(403);
    expect((await api(a).del(`/notes/${n._id}/members/${id(a)}`)).status).toBe(200);
    expect((await api(a).get(`/notes/${n._id}`)).status).toBe(404);
    expect((await api(b).get(`/notes/${n._id}`)).status).toBe(200);
  });

  it("shows the owner who has access, and hides that from people who can't see the note", async () => {
    const owner = await createUser();
    const a = await createUser();
    const stranger = await createUser();
    const n = await mkNote(owner);
    await share(owner, n._id, a, "viewer");

    const s = (await api(owner).get(`/notes/${n._id}/sharing`)).body.data;
    expect(s).toMatchObject({ can_manage: true, owner: { user_id: id(owner) } });
    expect(s.members).toHaveLength(1);
    expect((await api(a).get(`/notes/${n._id}/sharing`)).body.data).toMatchObject({ can_manage: false, share: null });
    expect((await api(stranger).get(`/notes/${n._id}/sharing`)).status).toBe(404);
  });
});
