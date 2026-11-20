import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenNoteVersion } from "../models/xenNote";
import { MAX_VERSIONS, VERSION_GAP_MS } from "../utils/xenNoteVersions";

// A note keeps its earlier wording so a change can be looked at and undone.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xennote/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const api = (who: U) => {
  const auth = { Authorization: `Bearer ${who.token}` };
  return {
    get: (url: string) => request(t.app).get(`/api/xennote${url}`).set(auth),
    post: (url: string, body?: object) => request(t.app).post(`/api/xennote${url}`).set(auth).send(body),
    put: (url: string, body: object) => request(t.app).put(`/api/xennote${url}`).set(auth).send(body),
    del: (url: string) => request(t.app).delete(`/api/xennote${url}`).set(auth),
  };
};
const make = async (who: U, body: object = { title: "v1", body: "first" }) =>
  (await api(who).post("/notes", { type: "text", ...body })).body.data.note as { _id: string };
const versions = async (who: U, id: string) =>
  (await api(who).get(`/notes/${id}/versions`)).body.data.versions as any[];
/** Make the newest version look old, so the next edit isn't treated as part of the same stretch of typing. */
const ageVersions = (id: string) =>
  XenNoteVersion.updateMany({ note_id: id }, { captured_at: new Date(Date.now() - VERSION_GAP_MS - 1000) });

describe("note versions", () => {
  it("keeps what the note said before an edit to its wording, newest first, with who and when", async () => {
    const me = await createUser();
    const n = await make(me);
    expect(await versions(me, n._id)).toEqual([]);

    await api(me).put(`/notes/${n._id}`, { title: "v2", body: "second" });
    await ageVersions(n._id);
    await api(me).put(`/notes/${n._id}`, { title: "v3", body: "third" });

    const list = await versions(me, n._id);
    expect(list.map((v) => v.title)).toEqual(["v2", "v1"]);
    expect(list[1]).toMatchObject({ title: "v1", preview: "first", by_name: me.user.username });

    const full = (await api(me).get(`/notes/${n._id}/versions/${list[1]._id}`)).body.data.version;
    expect(full).toMatchObject({ title: "v1", body: "first", type: "text" });
  });

  it("keeps nothing for a change that isn't wording, or when nothing changed", async () => {
    const me = await createUser();
    const n = await make(me);
    await api(me).put(`/notes/${n._id}`, { color: "red", pinned: true, archived: true, labels: ["x"] });
    await api(me).put(`/notes/${n._id}`, { title: "v1", body: "first" });
    expect(await versions(me, n._id)).toEqual([]);
  });

  it("treats a burst of autosaves as one: a new version waits until the last one is old enough", async () => {
    const me = await createUser();
    const n = await make(me, { title: "a", body: "" });
    for (const title of ["ab", "abc", "abcd"]) await api(me).put(`/notes/${n._id}`, { title });
    expect((await versions(me, n._id)).map((v) => v.title)).toEqual(["a"]);
  });

  it("keeps at most the newest 20", async () => {
    const me = await createUser();
    const n = await make(me, { title: "t0", body: "" });
    for (let i = 1; i <= MAX_VERSIONS + 4; i++) {
      await ageVersions(n._id);
      await api(me).put(`/notes/${n._id}`, { title: `t${i}` });
    }
    const list = await versions(me, n._id);
    expect(list).toHaveLength(MAX_VERSIONS);
    expect(list[0].title).toBe(`t${MAX_VERSIONS + 3}`);
  });

  it("restores a version, keeping what it replaced so the restore can be undone", async () => {
    const me = await createUser();
    const n = await make(me);
    await api(me).put(`/notes/${n._id}`, { title: "v2", body: "second" });
    const first = (await versions(me, n._id))[0];
    expect((await api(me).post(`/notes/${n._id}/versions/${first._id}/restore`)).status).toBe(200);

    const now = (await api(me).get(`/notes/${n._id}`)).body.data.note;
    expect(now).toMatchObject({ title: "v1", body: "first" });
    // v2 was kept even though the last version was only just made.
    expect((await versions(me, n._id)).map((v) => v.title)).toEqual(["v2", "v1"]);
  });

  it("works for checklists and links too", async () => {
    const me = await createUser();
    const list = (
      await api(me).post("/notes", { type: "checklist", title: "List", checklist: [{ text: "milk", done: true }] })
    ).body.data.note;
    await api(me).put(`/notes/${list._id}`, { checklist: [{ text: "milk", done: true }, { text: "eggs" }] });
    const [v] = await versions(me, list._id);
    expect(v.preview).toBe("milk");
    await api(me).post(`/notes/${list._id}/versions/${v._id}/restore`);
    const back = (await api(me).get(`/notes/${list._id}`)).body.data.note;
    expect(back.checklist.map((c: any) => [c.text, c.done])).toEqual([["milk", true]]);
  });

  it("follows who can see and edit the note", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const stranger = await createUser();
    const n = await make(owner, { title: "v1", body: "first" });
    await api(owner).post(`/notes/${n._id}/members`, { userIds: [viewer.user.id], role: "viewer" });
    await api(owner).put(`/notes/${n._id}`, { title: "v2" });
    const [v] = await versions(owner, n._id);

    expect((await versions(viewer, n._id)).map((x) => x._id)).toEqual([v._id]);
    expect((await api(viewer).get(`/notes/${n._id}/versions/${v._id}`)).status).toBe(200);
    expect((await api(viewer).post(`/notes/${n._id}/versions/${v._id}/restore`)).status).toBe(403);
    expect((await api(stranger).get(`/notes/${n._id}/versions`)).status).toBe(404);
    expect((await api(owner).get(`/notes/${n._id}/versions/${"a".repeat(24)}`)).status).toBe(404);
  });

  it("goes with the note when it is removed for good", async () => {
    const me = await createUser();
    const n = await make(me);
    await api(me).put(`/notes/${n._id}`, { title: "v2" });
    expect(await XenNoteVersion.countDocuments({ note_id: n._id })).toBe(1);
    await api(me).del(`/notes/${n._id}`);
    // In the Trash the history is kept (a restore brings the note back with it).
    expect(await XenNoteVersion.countDocuments({ note_id: n._id })).toBe(1);
    await api(me).del(`/trash/${n._id}`);
    expect(await XenNoteVersion.countDocuments({ note_id: n._id })).toBe(0);
  });
});
