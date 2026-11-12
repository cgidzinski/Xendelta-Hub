import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// XenNote through the real routes, models and validation against an in-memory database. Only storage is faked.

const stored = new Set<string>();
const removed: string[] = [];
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async (_buf: Buffer, path: string) => void stored.add(path)),
  deleteFromGCS: vi.fn(async (path: string) => {
    stored.delete(path);
    removed.push(path);
  }),
  generateSignedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xennote/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  stored.clear();
  removed.length = 0;
});

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
const note = async (who: U, body: object) => {
  const r = await api(who).post("/notes", body);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.note;
};
const notebook = async (who: U, name = "Home") => {
  const r = await api(who).post("/notebooks", { name });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.notebook as { _id: string };
};
const titles = async (who: U, query = "") =>
  (await api(who).get(`/notes${query}`)).body.data.notes.map((n: any) => n.title);

// A valid 1x1 PNG, so the image filter and sharp both accept it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("note types", () => {
  it("saves a text note, a checklist, a link and an image note", async () => {
    const me = await createUser();
    const text = await note(me, { type: "text", title: "Ideas", body: "buy a boat" });
    expect(text).toMatchObject({ type: "text", title: "Ideas", body: "buy a boat", checklist: [], can_edit: true });

    const list = await note(me, {
      type: "checklist",
      title: "Shopping",
      checklist: [
        { text: "milk", done: false },
        { text: "  ", done: false }, // blank items are dropped
        { text: "eggs", done: true },
      ],
    });
    expect(list.checklist.map((c: any) => [c.text, c.done])).toEqual([
      ["milk", false],
      ["eggs", true],
    ]);

    const link = await note(me, {
      type: "link",
      title: "Read later",
      link: { url: "https://example.com/a", title: "Example", description: "good one" },
    });
    expect(link.link).toEqual({ url: "https://example.com/a", title: "Example", description: "good one" });

    const photo = await note(me, { type: "image", title: "Trip", body: "caption" });
    expect(photo).toMatchObject({ type: "image", images: [] });
  });

  it("refuses a link that is not a web address, and a link note with no address", async () => {
    const me = await createUser();
    for (const url of ["javascript:alert(1)", "data:text/html,x", "example.com"]) {
      const r = await api(me).post("/notes", { type: "link", link: { url, title: "", description: "" } });
      expect(r.status, url).toBe(400);
    }
    const empty = await api(me).post("/notes", { type: "link", link: { url: "", title: "", description: "" } });
    expect(empty.status).toBe(400);
  });

  it("converting text to a checklist and back clears what no longer applies", async () => {
    const me = await createUser();
    const n = await note(me, { type: "text", title: "T", body: "a\nb" });
    const asList = await api(me).put(`/notes/${n._id}`, {
      type: "checklist",
      body: "",
      checklist: [
        { text: "a", done: false },
        { text: "b", done: true },
      ],
    });
    expect(asList.body.data.note.checklist).toHaveLength(2);

    const ticked = asList.body.data.note.checklist;
    // an existing item keeps its id and its tick when the list is saved again
    const again = await api(me).put(`/notes/${n._id}`, { checklist: [{ _id: ticked[1]._id, text: "b", done: true }] });
    expect(again.body.data.note.checklist).toEqual([{ _id: ticked[1]._id, text: "b", done: true }]);

    const back = await api(me).put(`/notes/${n._id}`, { type: "text", body: "a\nb" });
    expect(back.body.data.note).toMatchObject({ type: "text", checklist: [], body: "a\nb" });
  });

  it("normalises labels and keeps colour, pin and archive", async () => {
    const me = await createUser();
    const n = await note(me, {
      title: "x",
      labels: ["  Work ", "work", "Home  Office", ""],
      color: "blue",
      pinned: true,
    });
    expect(n.labels).toEqual(["Work", "Home Office"]);
    expect(n).toMatchObject({ color: "blue", pinned: true, archived: false });
    expect((await api(me).post("/notes", { title: "bad", color: "chartreuse" })).status).toBe(400);
  });
});

describe("the board", () => {
  it("pins first, hides archived, filters by label, and searches title, text, items and links", async () => {
    const me = await createUser();
    await note(me, { title: "plain" });
    const pinned = await note(me, { title: "pinned", pinned: true });
    await note(me, { title: "old", archived: true });
    await note(me, { title: "labelled", labels: ["Work"] });
    await note(me, { type: "checklist", title: "groceries", checklist: [{ text: "bananas", done: false }] });
    await note(me, {
      type: "link",
      title: "site",
      link: { url: "https://ex.com", title: "Docs", description: "reference" },
    });

    expect((await titles(me))[0]).toBe("pinned");
    expect(await titles(me)).not.toContain("old");
    expect(await titles(me, "?archived=true")).toEqual(["old"]);
    expect(await titles(me, "?label=work")).toEqual(["labelled"]);
    expect(await titles(me, "?q=banana")).toEqual(["groceries"]);
    expect(await titles(me, "?q=reference")).toEqual(["site"]);
    expect(pinned.pinned).toBe(true);

    const labels = (await api(me).get("/labels")).body.data.labels;
    expect(labels).toEqual([{ name: "Work", count: 1 }]);
  });

  it("a loose note is private: nobody else can read, list, change or delete it", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const mine = await note(me, { title: "secret" });
    expect(await titles(other)).toEqual([]);
    for (const r of [
      await api(other).get(`/notes/${mine._id}`),
      await api(other).put(`/notes/${mine._id}`, { title: "hijack" }),
      await api(other).del(`/notes/${mine._id}`),
      await api(other).post(`/notes/${mine._id}/share`),
    ]) {
      expect(r.status).toBe(404);
    }
  });
});

describe("notebooks and sharing", () => {
  it("members see the notebook's notes; roles decide who can change them", async () => {
    const [owner, editor, viewer, stranger] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);
    const nb = await notebook(owner, "Trip");
    const added = await api(owner).post(`/notebooks/${nb._id}/members`, {
      userIds: [String(editor.user._id)],
      role: "editor",
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    await api(owner).post(`/notebooks/${nb._id}/members`, { userIds: [String(viewer.user._id)], role: "viewer" });

    const shared = await note(owner, { title: "packing", notebook_id: nb._id });
    expect(await titles(editor)).toEqual(["packing"]);
    expect(await titles(viewer)).toEqual(["packing"]);
    expect(await titles(stranger)).toEqual([]);

    // editor writes; viewer reads only; a stranger does not know it exists
    expect((await api(editor).put(`/notes/${shared._id}`, { title: "packing list" })).status).toBe(200);
    expect((await api(viewer).put(`/notes/${shared._id}`, { title: "no" })).status).toBe(403);
    expect((await api(viewer).get(`/notes/${shared._id}`)).body.data.note.can_edit).toBe(false);
    expect((await api(stranger).get(`/notes/${shared._id}`)).status).toBe(404);
    expect((await api(viewer).post("/notes", { title: "x", notebook_id: nb._id })).status).toBe(403);
    expect((await api(stranger).post("/notes", { title: "x", notebook_id: nb._id })).status).toBe(404);

    // only the owner manages people, the notebook and its link
    expect((await api(editor).put(`/notebooks/${nb._id}`, { name: "mine now" })).status).toBe(403);
    expect((await api(editor).post(`/notebooks/${nb._id}/share`)).status).toBe(403);
    expect(
      (await api(editor).post(`/notebooks/${nb._id}/members`, { userIds: [String(stranger.user._id)] })).status,
    ).toBe(403);

    // the owner promotes the viewer; the new editor can now write
    expect((await api(owner).put(`/notebooks/${nb._id}/members/${viewer.user._id}`, { role: "editor" })).status).toBe(
      200,
    );
    expect((await api(viewer).put(`/notes/${shared._id}`, { title: "now ok" })).status).toBe(200);
  });

  it("shows who last changed a shared note, never for a private one, and counts the rail", async () => {
    const [owner, editor] = await Promise.all([createUser(), createUser()]);
    const nb = await notebook(owner, "Trip");
    await api(owner).post(`/notebooks/${nb._id}/members`, { userIds: [String(editor.user._id)], role: "editor" });
    const shared = await note(owner, { title: "packing", notebook_id: nb._id });
    const loose = await note(owner, { title: "private" });
    await note(owner, { title: "old", archived: true });

    await api(editor).put(`/notes/${shared._id}`, { title: "packing list" });
    const seen = (await api(owner).get("/notes")).body.data.notes;
    expect(seen.find((n: any) => n._id === shared._id).updated_by_name).toBe(editor.user.username);
    expect(seen.find((n: any) => n._id === loose._id).updated_by_name).toBeNull();
    expect((await api(owner).get(`/notes/${shared._id}`)).body.data.note.updated_by_name).toBe(editor.user.username);

    expect((await api(owner).get("/counts")).body.data).toEqual({ all: 2, mine: 1, archived: 1 });
    // the editor sees the shared note but not the owner's private or archived ones
    expect((await api(editor).get("/counts")).body.data).toEqual({ all: 1, mine: 0, archived: 0 });
    expect((await api().get("/counts")).status).toBe(401);
  });

  it("a member can leave, the owner can remove people, and the owner cannot leave", async () => {
    const [owner, member] = await Promise.all([createUser(), createUser()]);
    const nb = await notebook(owner);
    await api(owner).post(`/notebooks/${nb._id}/members`, { userIds: [String(member.user._id)], role: "editor" });
    expect((await api(owner).del(`/notebooks/${nb._id}/members/${owner.user._id}`)).status).toBe(400);
    expect((await api(member).del(`/notebooks/${nb._id}/members/${member.user._id}`)).status).toBe(200);
    expect((await api(member).get("/notebooks")).body.data.notebooks).toEqual([]);
  });

  it("moves a note between notebooks, needing edit rights on both, and only its author can make it private", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const mine = await notebook(a, "Mine");
    const theirs = await notebook(b, "Theirs");
    const n = await note(a, { title: "movable", notebook_id: mine._id });

    expect((await api(a).put(`/notes/${n._id}`, { notebook_id: theirs._id })).status).toBe(404); // not a member there
    await api(b).post(`/notebooks/${theirs._id}/members`, { userIds: [String(a.user._id)], role: "viewer" });
    expect((await api(a).put(`/notes/${n._id}`, { notebook_id: theirs._id })).status).toBe(403); // viewer only

    await api(b).put(`/notebooks/${theirs._id}/members/${a.user._id}`, { role: "editor" });
    const moved = await api(a).put(`/notes/${n._id}`, { notebook_id: theirs._id });
    expect(moved.body.data.note.notebook_id).toBe(theirs._id);

    // b is an editor of that notebook but did not write the note: cannot take it private
    expect((await api(b).put(`/notes/${n._id}`, { notebook_id: null })).status).toBe(403);
    expect((await api(a).put(`/notes/${n._id}`, { notebook_id: null })).body.data.note.notebook_id).toBeNull();
    expect(await titles(b, `?notebook=${theirs._id}`)).toEqual([]);
  });

  it("deleting a notebook deletes its notes and their photos", async () => {
    const me = await createUser();
    const nb = await notebook(me);
    const n = await note(me, { type: "image", title: "pic", notebook_id: nb._id });
    const up = await request(t.app)
      .post(`/api/xennote/notes/${n._id}/images`)
      .set({ Authorization: `Bearer ${me.token}` })
      .attach("images", PNG, "a.png");
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(stored.size).toBe(1);

    expect((await api(me).del(`/notebooks/${nb._id}`)).status).toBe(200);
    expect(stored.size).toBe(0);
    expect(await titles(me)).toEqual([]);
  });
});

describe("photos", () => {
  it("adds, lists with signed URLs, limits the count, removes, and cleans up with the note", async () => {
    const me = await createUser();
    const n = await note(me, { type: "image", title: "pics" });
    const send = (count: number) => {
      let r = request(t.app)
        .post(`/api/xennote/notes/${n._id}/images`)
        .set({ Authorization: `Bearer ${me.token}` });
      for (let i = 0; i < count; i++) r = r.attach("images", PNG, `p${i}.png`);
      return r;
    };

    const up = await send(2);
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.data.note.images).toHaveLength(2);
    expect(up.body.data.note.images[0].url).toMatch(/^https:\/\/signed\.example\/xennote\//);
    expect(stored.size).toBe(2);

    expect((await send(9)).status).toBe(400); // 2 + 9 would pass the limit of 10

    const first = up.body.data.note.images[0]._id;
    const after = await api(me).del(`/notes/${n._id}/images/${first}`);
    expect(after.body.data.note.images).toHaveLength(1);
    expect(stored.size).toBe(1);

    expect((await api(me).del(`/notes/${n._id}`)).status).toBe(200);
    expect(stored.size).toBe(0);
  });

  it("a viewer cannot add photos", async () => {
    const [owner, viewer] = await Promise.all([createUser(), createUser()]);
    const nb = await notebook(owner);
    await api(owner).post(`/notebooks/${nb._id}/members`, { userIds: [String(viewer.user._id)], role: "viewer" });
    const n = await note(owner, { type: "image", title: "x", notebook_id: nb._id });
    const r = await request(t.app)
      .post(`/api/xennote/notes/${n._id}/images`)
      .set({ Authorization: `Bearer ${viewer.token}` })
      .attach("images", PNG, "a.png");
    expect(r.status).toBe(403);
  });
});

describe("public links", () => {
  it("a note's link shows only what is safe, and stops working when disabled or rotated", async () => {
    const me = await createUser();
    const n = await note(me, {
      type: "checklist",
      title: "Packing",
      checklist: [{ text: "tent", done: true }],
      labels: ["trip"],
    });

    const on = await api(me).post(`/notes/${n._id}/share`);
    const token = on.body.data.note.share.token;
    expect(token).toHaveLength(22);

    const view = await api().get(`/public/note/${token}`); // signed out
    expect(view.status).toBe(200);
    expect(view.body.data.note).toMatchObject({
      title: "Packing",
      type: "checklist",
      checklist: [{ text: "tent", done: true }],
    });
    expect(JSON.stringify(view.body)).not.toContain(String(me.user._id)); // no owner id leaks
    expect(view.body.data.note.share).toBeUndefined();

    const rotated = (await api(me).post(`/notes/${n._id}/share/rotate`)).body.data.note.share.token;
    expect(rotated).not.toBe(token);
    expect((await api().get(`/public/note/${token}`)).status).toBe(404);
    expect((await api().get(`/public/note/${rotated}`)).status).toBe(200);

    await api(me).del(`/notes/${n._id}/share`);
    expect((await api().get(`/public/note/${rotated}`)).status).toBe(404);
  });

  it("a notebook's link lists its un-archived notes read-only, and only the owner can turn it on", async () => {
    const [owner, editor] = await Promise.all([createUser(), createUser()]);
    const nb = await notebook(owner, "Recipes");
    await api(owner).post(`/notebooks/${nb._id}/members`, { userIds: [String(editor.user._id)], role: "editor" });
    await note(owner, { title: "pie", notebook_id: nb._id });
    await note(owner, { title: "old", notebook_id: nb._id, archived: true });
    await note(owner, { title: "private, not in the notebook" });

    expect((await api(editor).post(`/notebooks/${nb._id}/share`)).status).toBe(403);
    const token = (await api(owner).post(`/notebooks/${nb._id}/share`)).body.data.notebook.share.token;

    const view = await api().get(`/public/notebook/${token}`);
    expect(view.body.data.notebook.name).toBe("Recipes");
    expect(view.body.data.notes.map((n: any) => n.title)).toEqual(["pie"]);

    await api(owner).del(`/notebooks/${nb._id}/share`);
    expect((await api().get(`/public/notebook/${token}`)).status).toBe(404);
  });

  it("a malformed token is a 400, not a database query", async () => {
    expect((await api().get("/public/note/%24ne")).status).toBe(400);
    expect((await api().get("/public/notebook/short")).status).toBe(400);
  });
});

describe("who can reach what", () => {
  it("every non-public route needs a signed-in user", async () => {
    expect((await api().get("/notes")).status).toBe(401);
    expect((await api().get("/notebooks")).status).toBe(401);
    expect((await api().post("/notes", { title: "x" })).status).toBe(401);
  });

  it("limits how many notebooks one person can own", async () => {
    const me = await createUser();
    for (let i = 0; i < 30; i++) await notebook(me, `n${i}`);
    expect((await api(me).post("/notebooks", { name: "one too many" })).status).toBe(400);
  });
});
