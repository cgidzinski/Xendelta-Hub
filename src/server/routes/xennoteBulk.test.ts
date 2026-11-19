import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Changing or trashing several notes at once. Notes the caller can't edit are left alone.
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
  };
};
const note = async (who: U, body: object = {}) => {
  const r = await api(who).post("/notes", { type: "text", title: "N", ...body });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.note as { _id: string };
};
const notes = async (who: U, q = "") => (await api(who).get(`/notes${q}`)).body.data.notes as any[];
const bulk = (who: U, body: object) => api(who).post("/notes/bulk-update", body);

describe("bulk update", () => {
  it("archives, recolours and labels several notes at once", async () => {
    const me = await createUser();
    const a = await note(me, { title: "A" });
    const b = await note(me, { title: "B", labels: ["old"] });
    await note(me, { title: "C" });

    const res = await bulk(me, { ids: [a._id, b._id], archived: true, color: "red", add_label: "Work" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ updated: 2, skipped: 0 });
    const archived = await notes(me, "?archived=true");
    expect(archived.map((n) => n.title).sort()).toEqual(["A", "B"]);
    expect(archived.every((n) => n.color === "red")).toBe(true);
    expect(archived.find((n) => n.title === "B").labels.sort()).toEqual(["Work", "old"]);
    expect((await notes(me)).map((n) => n.title)).toEqual(["C"]);

    await bulk(me, { ids: [a._id, b._id], remove_label: "work", archived: false });
    const back = await notes(me);
    expect(back).toHaveLength(3);
    expect(back.find((n) => n.title === "A").labels).toEqual([]);
  });

  it("moves notes into a notebook and back out to private notes", async () => {
    const me = await createUser();
    const book = (await api(me).post("/notebooks", { name: "Home" })).body.data.notebook;
    const a = await note(me, { title: "A" });
    const b = await note(me, { title: "B" });

    expect((await bulk(me, { ids: [a._id, b._id], notebook_id: book._id })).body.data.updated).toBe(2);
    expect((await notes(me, `?notebook=${book._id}`)).map((n) => n.title).sort()).toEqual(["A", "B"]);
    expect(await notes(me, "?notebook=none")).toEqual([]);

    await bulk(me, { ids: [a._id], notebook_id: null });
    expect((await notes(me, "?notebook=none")).map((n) => n.title)).toEqual(["A"]);
  });

  it("only changes what the caller can edit, and refuses a notebook they can't write to", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const stranger = await createUser();
    const book = (await api(owner).post("/notebooks", { name: "Team" })).body.data.notebook;
    await api(owner).post(`/notebooks/${book._id}/members`, { userIds: [String(viewer.user._id)], role: "viewer" });
    const shared = await note(owner, { title: "Shared", notebook_id: book._id });
    const mine = await note(viewer, { title: "Mine" });
    const theirs = await note(stranger, { title: "Theirs" });

    const res = await bulk(viewer, { ids: [shared._id, mine._id, theirs._id], color: "blue" });
    expect(res.body.data).toEqual({ updated: 1, skipped: 2 });
    expect((await notes(viewer)).find((n) => n.title === "Mine").color).toBe("blue");
    expect((await notes(owner)).find((n) => n.title === "Shared").color).not.toBe("blue");
    expect((await notes(stranger))[0].color).not.toBe("blue");

    // Can't move into a notebook the caller can only view.
    expect((await bulk(viewer, { ids: [mine._id], notebook_id: book._id })).status).toBe(403);
  });

  it("refuses an empty request and a malformed one", async () => {
    const me = await createUser();
    const a = await note(me);
    expect((await bulk(me, { ids: [a._id] })).status).toBe(400);
    expect((await bulk(me, { ids: [], archived: true })).status).toBe(400);
    expect((await bulk(me, { ids: ["nope"], archived: true })).status).toBe(400);
    expect((await bulk(me, { ids: [a._id], color: "plaid" })).status).toBe(400);
  });
});

describe("bulk delete", () => {
  it("sends the chosen notes to the Trash, where they can be restored", async () => {
    const me = await createUser();
    const other = await createUser();
    const a = await note(me, { title: "A" });
    const b = await note(me, { title: "B" });
    await note(me, { title: "C" });
    const theirs = await note(other, { title: "Theirs" });

    const res = await api(me).post("/notes/bulk-delete", { ids: [a._id, b._id, theirs._id] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ deleted: 2, skipped: 1 });
    expect((await notes(me)).map((n) => n.title)).toEqual(["C"]);
    expect((await notes(other)).map((n) => n.title)).toEqual(["Theirs"]);
    expect(((await api(me).get("/trash")).body.data.notes as any[]).map((n) => n.title).sort()).toEqual(["A", "B"]);

    await api(me).post(`/trash/${a._id}/restore`);
    expect((await notes(me)).map((n) => n.title).sort()).toEqual(["A", "C"]);
  });
});
