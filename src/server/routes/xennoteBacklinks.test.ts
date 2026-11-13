import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// "Linked from": which notes link to this one with [[its title]]. Real routes and models; only storage is faked.
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
const note = async (who: U, body: object) => (await api(who).post("/notes", body)).body.data.note;
const linkedFrom = async (who: U, id: string) =>
  (await api(who).get(`/notes/${id}/backlinks`)).body.data.notes.map((n: any) => n.title) as string[];

describe("notes that link to a note", () => {
  it("lists the notes with [[its title]], loosely matched, newest first", async () => {
    const me = await createUser();
    const target = await note(me, { title: "Trip plan" });
    await note(me, { title: "Packing", body: "Remember [[Trip plan]] for dates" });
    await note(me, { title: "Budget", body: "see [[trip   PLAN|the plan]] and more" });
    await note(me, { title: "Unrelated", body: "nothing here" });
    await note(me, { title: "Near miss", body: "see [[Trip plans]] instead" });
    await note(me, { title: "Plain brackets", body: "see [Trip plan] or Trip plan" });
    expect(await linkedFrom(me, target._id)).toEqual(["Budget", "Packing"]);
  });

  it("is empty for a note with no title, and for one nobody links to", async () => {
    const me = await createUser();
    const untitled = await note(me, { title: "", body: "hello" });
    const lonely = await note(me, { title: "Lonely" });
    await note(me, { title: "Other", body: "[[]] and [[  ]]" });
    expect(await linkedFrom(me, untitled._id)).toEqual([]);
    expect(await linkedFrom(me, lonely._id)).toEqual([]);
  });

  it("copes with titles that have regular-expression characters in them", async () => {
    const me = await createUser();
    const target = await note(me, { title: "What? (draft) [v2] + more.*" });
    await note(me, { title: "Mentions it", body: "[[What? (draft) [v2] + more.*]]" }); // brackets inside: not a link
    await note(me, { title: "A decoy", body: "[[What draft v2 more]]" });
    expect(await linkedFrom(me, target._id)).toEqual([]);
    const plain = await note(me, { title: "C++ (notes) ?*" });
    await note(me, { title: "Linker", body: "go to [[C++ (notes) ?*]]" });
    await note(me, { title: "Decoy 2", body: "go to [[C notes]]" });
    expect(await linkedFrom(me, plain._id)).toEqual(["Linker"]);
  });

  it("doesn't count the note itself, an archived note, or a different person's private note", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const target = await note(me, { title: "Hub", body: "I mention [[Hub]] myself" });
    const archived = await note(me, { title: "Old", body: "[[Hub]]" });
    await api(me).put(`/notes/${archived._id}`, { archived: true });
    await note(other, { title: "Theirs", body: "[[Hub]] in a private note of someone else" });
    await note(me, { title: "Mine", body: "[[Hub]]" });
    expect(await linkedFrom(me, target._id)).toEqual(["Mine"]);
  });

  it("includes notes in a shared notebook, and leaves out ones in notebooks the caller isn't in", async () => {
    const [owner, member, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
    const shared = (await api(owner).post("/notebooks", { name: "Family" })).body.data.notebook;
    const add = await api(owner).post(`/notebooks/${shared._id}/members`, {
      userIds: [String(member.user._id)],
      role: "viewer",
    });
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    const hidden = (await api(outsider).post("/notebooks", { name: "Secret" })).body.data.notebook;

    const target = await note(owner, { title: "Family plan", notebook_id: shared._id });
    await note(owner, { title: "In the family book", body: "[[Family plan]]", notebook_id: shared._id });
    await note(outsider, { title: "In a hidden book", body: "[[Family plan]]", notebook_id: hidden._id });
    await note(member, { title: "Member's own", body: "[[Family plan]]" });

    // the member can see the shared note, and the family book's link and their own, but never the hidden one
    expect((await linkedFrom(member, target._id)).sort()).toEqual(["In the family book", "Member's own"]);
    expect(await linkedFrom(owner, target._id)).toEqual(["In the family book"]);
  });

  it("refuses a note the caller can't see, and needs sign-in", async () => {
    const [me, stranger] = await Promise.all([createUser(), createUser()]);
    const mine = await note(me, { title: "Private" });
    expect((await api(stranger).get(`/notes/${mine._id}/backlinks`)).status).toBe(404);
    expect((await request(t.app).get(`/api/xennote/notes/${mine._id}/backlinks`)).status).toBe(401);
    expect((await api(me).get(`/notes/not-an-id/backlinks`)).status).toBe(400);
  });

  it("returns only what the list needs, never the body", async () => {
    const me = await createUser();
    const target = await note(me, { title: "Hub" });
    await note(me, { title: "Linker", body: "secret words [[Hub]]" });
    const res = await api(me).get(`/notes/${target._id}/backlinks`);
    expect(Object.keys(res.body.data.notes[0]).sort()).toEqual(["_id", "notebook_id", "title", "type", "updated_at"]);
    expect(JSON.stringify(res.body)).not.toContain("secret words");
  });
});
