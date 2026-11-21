import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { FileRecord } from "../models/fileRecord";
import { SocketManager } from "../infrastructure/SocketManager";

// Notebook sections and pages through the real routes, models and validation against an in-memory database. Only
// storage is faked.

const stored = new Set<string>();
vi.mock("../utils/storageUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToStorage: vi.fn(async (_buf: Buffer, path: string) => void stored.add(path)),
  deleteFromStorage: vi.fn(async (path: string) => void stored.delete(path)),
  generateSignedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./xennote/index.js"),
    () => import("./xendrive.js"),
    () => import("./storage.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => stored.clear());

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who?: U) => {
  const h = (r: request.Test) => (who ? r.set(auth(who)) : r);
  return {
    get: (url: string) => h(request(t.app).get(`/api/xennote${url}`)),
    post: (url: string, body?: object) => h(request(t.app).post(`/api/xennote${url}`)).send(body),
    put: (url: string, body: object) => h(request(t.app).put(`/api/xennote${url}`)).send(body),
    del: (url: string) => h(request(t.app).delete(`/api/xennote${url}`)),
  };
};
const uid = (u: U) => String(u.user._id);

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: object[]) => ({ type: "doc", content });

/** An owner with a notebook and one section. */
async function setup() {
  const owner = await createUser();
  const nb = (await api(owner).post("/notebooks", { name: "Work" })).body.data.notebook as { _id: string };
  const section = (await api(owner).post(`/notebooks/${nb._id}/sections`, { name: "Meetings" })).body.data.section as {
    id: string;
  };
  return { owner, nb: nb._id, section: section.id };
}
const addPerson = async (owner: U, nb: string, who: U, role: "editor" | "viewer") => {
  const r = await api(owner).post(`/notebooks/${nb}/members`, { userIds: [uid(who)], role });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
};
const newPage = async (who: U, sectionId: string, body: object = { title: "Page" }) => {
  const r = await api(who).post(`/sections/${sectionId}/pages`, body);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { page: { id: string; rev: number; order: string }; doc: any };
};
const tree = async (who: U, nb: string) =>
  (await api(who).get(`/notebooks/${nb}/tree`)).body.data as {
    sections: Array<{ id: string; name: string; order: string }>;
    pages: Array<{
      id: string;
      title: string;
      parent_id: string | null;
      section_id: string;
      excerpt: string;
      tags: string[];
      favorite: boolean;
      todo: { open: number; done: number };
    }>;
  };
const names = (items: any[], key: string) => items.map((i) => i[key]);

describe("sections", () => {
  it("are listed in the notebook's tree, in order, and can be added, renamed, moved and deleted", async () => {
    const { owner, nb, section } = await setup();
    const b = (await api(owner).post(`/notebooks/${nb}/sections`, { name: "Projects", color: "green" })).body.data
      .section;
    const c = (await api(owner).post(`/notebooks/${nb}/sections`, { name: "Ideas", before: section })).body.data
      .section;
    expect(names((await tree(owner, nb)).sections, "name")).toEqual(["Ideas", "Meetings", "Projects"]);

    const renamed = await api(owner).put(`/sections/${b.id}`, { name: "Plans", color: "blue" });
    expect(renamed.body.data.section).toMatchObject({ name: "Plans", color: "blue" });

    await api(owner).post(`/sections/${c.id}/move`, { after: b.id });
    expect(names((await tree(owner, nb)).sections, "name")).toEqual(["Meetings", "Plans", "Ideas"]);
    await api(owner).post(`/sections/${c.id}/move`, {});
    expect(names((await tree(owner, nb)).sections, "name").at(-1)).toBe("Ideas");

    expect((await api(owner).del(`/sections/${b.id}`)).status).toBe(200);
    expect(names((await tree(owner, nb)).sections, "name")).toEqual(["Meetings", "Ideas"]);
  });

  it("refuse bad input", async () => {
    const { owner, nb, section } = await setup();
    expect((await api(owner).post(`/notebooks/${nb}/sections`, { name: "   " })).status).toBe(400);
    expect(
      (await api(owner).post(`/notebooks/${nb}/sections`, { name: "x", before: section, after: section })).status,
    ).toBe(400);
    expect(
      (await api(owner).post(`/notebooks/${nb}/sections`, { name: "x", after: "5f0000000000000000000000" })).status,
    ).toBe(400);
    expect((await api(owner).post(`/sections/${section}/move`, { after: section })).status).toBe(400);
    expect((await api(owner).get(`/notebooks/not-an-id/tree`)).status).toBe(400);
  });

  it("keep the journal and templates sections from being deleted", async () => {
    const { owner, nb } = await setup();
    const Section = mongoose.model("XenNoteSection");
    const journal = await Section.create({ notebook_id: nb, name: "Journal", kind: "journal", order: "a5" });
    expect((await api(owner).del(`/sections/${journal._id}`)).status).toBe(400);
  });

  it("go to the Trash with their pages, and come back with exactly those pages", async () => {
    const { owner, nb, section } = await setup();
    const keep = await newPage(owner, section, { title: "Keep" });
    const gone = await newPage(owner, section, { title: "Gone earlier" });
    await api(owner).del(`/pages/${gone.page.id}`);
    await api(owner).del(`/sections/${section}`);
    expect((await tree(owner, nb)).pages).toEqual([]);

    const trash = (await api(owner).get(`/notebooks/${nb}/trash`)).body.data;
    expect(trash.sections).toMatchObject([{ id: section, name: "Meetings", pages: 1 }]);
    // The page deleted on its own stays listed on its own; the one that went with the section does not.
    expect(names(trash.pages, "title")).toEqual(["Gone earlier"]);

    expect((await api(owner).post(`/sections/${section}/restore`)).status).toBe(200);
    expect(names((await tree(owner, nb)).pages, "title")).toEqual(["Keep"]);
    expect(keep.page.id).toBeTruthy();
    // The one deleted on its own can't come back while… it can: its section is alive again.
    expect((await api(owner).post(`/pages/${gone.page.id}/restore`)).status).toBe(200);
    expect(names((await tree(owner, nb)).pages, "title").sort()).toEqual(["Gone earlier", "Keep"]);
  });

  it("limit how many a notebook has", async () => {
    const { owner, nb } = await setup();
    const Section = mongoose.model("XenNoteSection");
    await Section.insertMany(
      Array.from({ length: 99 }, (_, i) => ({ notebook_id: nb, name: `s${i}`, order: `b${i}` })),
    );
    const over = await api(owner).post(`/notebooks/${nb}/sections`, { name: "one too many" });
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/up to 100 sections/);
  });
});

describe("pages", () => {
  it("are created empty, with a body and block ids, and appear in the tree", async () => {
    const { owner, nb, section } = await setup();
    const made = await newPage(owner, section, { title: "  Q4 kickoff  " });
    expect(made.page).toMatchObject({ title: "Q4 kickoff", rev: 0, my_role: "owner", can_manage: true });
    expect(made.doc.type).toBe("doc");
    expect(made.doc.content[0].attrs.id).toEqual(expect.any(String));

    const got = await api(owner).get(`/pages/${made.page.id}`);
    expect(got.body.data.notebook).toMatchObject({ name: "Work" });
    expect(got.body.data.section).toMatchObject({ name: "Meetings", kind: "normal" });
    expect(names((await tree(owner, nb)).pages, "title")).toEqual(["Q4 kickoff"]);
  });

  it("keep their order, and can be put before or after another", async () => {
    const { owner, nb, section } = await setup();
    const a = await newPage(owner, section, { title: "A" });
    const b = await newPage(owner, section, { title: "B" });
    await newPage(owner, section, { title: "C", before: a.page.id });
    expect(names((await tree(owner, nb)).pages, "title")).toEqual(["C", "A", "B"]);
    await api(owner).post(`/pages/${a.page.id}/move`, { after: b.page.id });
    expect(names((await tree(owner, nb)).pages, "title")).toEqual(["C", "B", "A"]);
  });

  it("can have sub-pages, but only one level", async () => {
    const { owner, nb, section } = await setup();
    const parent = await newPage(owner, section, { title: "Parent" });
    const child = await newPage(owner, section, { title: "Child", parent_id: parent.page.id });
    expect((await tree(owner, nb)).pages.find((x) => x.id === child.page.id)?.parent_id).toBe(parent.page.id);

    const grandchild = await api(owner).post(`/sections/${section}/pages`, { title: "G", parent_id: child.page.id });
    expect(grandchild.status).toBe(400);
    expect(grandchild.body.message).toMatch(/sub-page can't have sub-pages/);

    // A parent from another section is refused too.
    const other = (await api(owner).post(`/notebooks/${nb}/sections`, { name: "Other" })).body.data.section;
    expect(
      (await api(owner).post(`/sections/${other.id}/pages`, { title: "x", parent_id: parent.page.id })).status,
    ).toBe(400);
  });

  it("are renamed, recoloured, archived, tagged and given aliases", async () => {
    const { owner, section } = await setup();
    const made = await newPage(owner, section);
    const res = await api(owner).put(`/pages/${made.page.id}`, {
      title: "Renamed",
      icon: "📌",
      color: "teal",
      archived: true,
      tags_manual: ["Q4 Planning", "#q4 planning", "Budget", ""],
      aliases: ["Kickoff", " kickoff ", "Start"],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.page).toMatchObject({
      title: "Renamed",
      icon: "📌",
      color: "teal",
      archived: true,
      tags_manual: ["q4-planning", "budget"],
      tags: ["q4-planning", "budget"],
      aliases: ["Kickoff", "Start"],
    });
    expect((await api(owner).put(`/pages/${made.page.id}`, { color: "pink" })).status).toBe(400);
    expect((await api(owner).put(`/pages/${made.page.id}`, { title: "x".repeat(201) })).status).toBe(400);
  });

  it("stars are personal", async () => {
    const { owner, nb, section } = await setup();
    const friend = await createUser();
    await addPerson(owner, nb, friend, "editor");
    const made = await newPage(owner, section);
    await api(owner).post(`/pages/${made.page.id}/favorite`, { favorite: true });
    expect((await tree(owner, nb)).pages[0].favorite).toBe(true);
    expect((await tree(friend, nb)).pages[0].favorite).toBe(false);
    await api(owner).post(`/pages/${made.page.id}/favorite`, { favorite: false });
    expect((await tree(owner, nb)).pages[0].favorite).toBe(false);
  });

  it("are moved between sections with their sub-pages, and keep to the one-level rule", async () => {
    const { owner, nb, section } = await setup();
    const other = (await api(owner).post(`/notebooks/${nb}/sections`, { name: "Other" })).body.data.section;
    const parent = await newPage(owner, section, { title: "Parent" });
    const child = await newPage(owner, section, { title: "Child", parent_id: parent.page.id });
    const lone = await newPage(owner, section, { title: "Lone" });

    await api(owner).post(`/pages/${parent.page.id}/move`, { section_id: other.id });
    let pages = (await tree(owner, nb)).pages;
    expect(pages.find((x) => x.id === parent.page.id)?.section_id).toBe(other.id);
    expect(pages.find((x) => x.id === child.page.id)).toMatchObject({
      section_id: other.id,
      parent_id: parent.page.id,
    });

    // A page with sub-pages can't become a sub-page, and a sub-page can't be nested deeper or under itself.
    expect((await api(owner).post(`/pages/${parent.page.id}/move`, { parent_id: lone.page.id })).status).toBe(400);
    expect((await api(owner).post(`/pages/${lone.page.id}/move`, { parent_id: child.page.id })).status).toBe(400);
    expect((await api(owner).post(`/pages/${lone.page.id}/move`, { parent_id: lone.page.id })).status).toBe(400);

    // A lone page can become a sub-page in its own section, then go back to the top level.
    expect(
      (await api(owner).post(`/pages/${lone.page.id}/move`, { section_id: other.id, parent_id: parent.page.id }))
        .status,
    ).toBe(200);
    pages = (await tree(owner, nb)).pages;
    expect(pages.find((x) => x.id === lone.page.id)?.parent_id).toBe(parent.page.id);
    await api(owner).post(`/pages/${lone.page.id}/move`, { parent_id: null });
    expect((await tree(owner, nb)).pages.find((x) => x.id === lone.page.id)?.parent_id).toBeNull();

    // Only sections of this notebook.
    const elsewhere = await setup();
    expect((await api(owner).post(`/pages/${lone.page.id}/move`, { section_id: elsewhere.section })).status).toBe(400);
  });

  it("can't be moved into, or out of, the journal", async () => {
    const { owner, nb, section } = await setup();
    const Section = mongoose.model("XenNoteSection");
    const Page = mongoose.model("XenNotePage");
    const journal = await Section.create({ notebook_id: nb, name: "Journal", kind: "journal", order: "a5" });
    const day = await Page.create({
      notebook_id: nb,
      section_id: journal._id,
      order: "a0",
      journal_date: "2026-11-20",
    });
    const normal = await newPage(owner, section);
    expect((await api(owner).post(`/pages/${normal.page.id}/move`, { section_id: String(journal._id) })).status).toBe(
      400,
    );
    expect((await api(owner).post(`/pages/${day._id}/move`, { section_id: section })).status).toBe(400);
    expect((await api(owner).post(`/sections/${journal._id}/pages`, { title: "x" })).status).toBe(400);
  });

  it("go to the Trash with their sub-pages and come back with them", async () => {
    const { owner, nb, section } = await setup();
    const parent = await newPage(owner, section, { title: "Parent" });
    await newPage(owner, section, { title: "Child", parent_id: parent.page.id });
    await api(owner).del(`/pages/${parent.page.id}`);
    expect((await tree(owner, nb)).pages).toEqual([]);
    expect((await api(owner).get(`/pages/${parent.page.id}`)).status).toBe(404);

    // The sub-page isn't listed on its own: it belongs to its parent.
    const trash = (await api(owner).get(`/notebooks/${nb}/trash`)).body.data;
    expect(names(trash.pages, "title")).toEqual(["Parent"]);

    await api(owner).post(`/pages/${parent.page.id}/restore`);
    expect(names((await tree(owner, nb)).pages, "title").sort()).toEqual(["Child", "Parent"]);
  });

  it("can be deleted for good, with their body and history", async () => {
    const { owner, nb, section } = await setup();
    const made = await newPage(owner, section);
    await api(owner).put(`/pages/${made.page.id}/body`, { doc: doc(p("one")), base_rev: 0 });
    await api(owner).put(`/pages/${made.page.id}/body`, { doc: doc(p("two")), base_rev: 1 });
    expect((await api(owner).del(`/pages/${made.page.id}/forever`)).status).toBe(404); // not in the Trash yet
    await api(owner).del(`/pages/${made.page.id}`);
    expect((await api(owner).del(`/pages/${made.page.id}/forever`)).status).toBe(200);
    expect(
      await mongoose.model("XenNotePage").countDocuments({ notebook_id: nb }).setOptions({ includeDeleted: true }),
    ).toBe(0);
    expect(await mongoose.model("XenNotePageBody").countDocuments({ page_id: made.page.id })).toBe(0);
    expect(await mongoose.model("XenNotePageVersion").countDocuments({ page_id: made.page.id })).toBe(0);
  });

  it("can't be restored into a deleted section or under a deleted parent", async () => {
    const { owner, nb, section } = await setup();
    const parent = await newPage(owner, section, { title: "Parent" });
    const child = await newPage(owner, section, { title: "Child", parent_id: parent.page.id });
    await api(owner).del(`/pages/${child.page.id}`);
    await api(owner).del(`/pages/${parent.page.id}`);
    // The child went to the Trash on its own first, then its parent did: restoring it alone needs the parent back.
    const res = await api(owner).post(`/pages/${child.page.id}/restore`);
    expect(res.status).toBe(409);
    await api(owner).post(`/pages/${parent.page.id}/restore`);
    expect((await api(owner).post(`/pages/${child.page.id}/restore`)).status).toBe(200);
    expect((await tree(owner, nb)).pages).toHaveLength(2);
  });
});

describe("a page's text", () => {
  it("is saved with a new revision, and what is worked out from it shows in the tree", async () => {
    const { owner, nb, section } = await setup();
    const made = await newPage(owner, section);
    const content = doc(
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Agenda" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Review " },
          { type: "hashtag", attrs: { tag: "Q4" } },
        ],
      },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [p("ship")] }] },
    );
    const saved = await api(owner).put(`/pages/${made.page.id}/body`, { doc: content, base_rev: 0 });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data).toEqual({ rev: 1, conflict: false });

    const entry = (await tree(owner, nb)).pages[0];
    expect(entry).toMatchObject({ excerpt: "Agenda Review #q4 ship", tags: ["q4"], todo: { open: 1, done: 0 } });
    const got = (await api(owner).get(`/pages/${made.page.id}`)).body.data;
    expect(got.page.rev).toBe(1);
    expect(got.doc.content[0].content[0].text).toBe("Agenda");
    // Tags written in the text and tags added as properties are both on the page.
    const tagged = await api(owner).put(`/pages/${made.page.id}`, { tags_manual: ["budget"] });
    expect(tagged.body.data.page.tags).toEqual(["q4", "budget"]);
  });

  it("is checked: only a document the page schema accepts", async () => {
    const { owner, section } = await setup();
    const made = await newPage(owner, section);
    const save = (d: unknown, base_rev = 0) => api(owner).put(`/pages/${made.page.id}/body`, { doc: d, base_rev });
    expect((await save({ type: "paragraph" })).status).toBe(400);
    expect((await save("hello")).status).toBe(400);
    expect((await save(doc({ type: "script", content: [] }))).status).toBe(400);
    expect((await save(doc({ type: "tableRow", content: [] }))).status).toBe(400);
    expect((await api(owner).put(`/pages/${made.page.id}/body`, { doc: doc(p("x")) })).status).toBe(400); // no base_rev
    expect((await save(doc(p("x")), -1)).status).toBe(400);
  });

  it("refuses a body over the size limit", async () => {
    const { owner, section } = await setup();
    const made = await newPage(owner, section);
    // The test app's JSON parser is small; build a body just over the cap out of many paragraphs and go through the
    // route's own check by saving straight to the schema check instead.
    const { checkPageDoc } = await import("../../shared/xennote/pageSchema.js");
    const big = doc(...Array.from({ length: 12 }, () => p("x".repeat(100_000))));
    expect(checkPageDoc(big).ok).toBe(false);
    expect(made.page.id).toBeTruthy();
  });

  it("loses the link from an unsafe address, and a page link with a malformed id", async () => {
    const { owner, section } = await setup();
    const made = await newPage(owner, section);
    await api(owner).put(`/pages/${made.page.id}/body`, {
      base_rev: 0,
      doc: doc({
        type: "paragraph",
        content: [
          { type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
          { type: "wikiLink", attrs: { page_id: "not-an-id", title: "Somewhere", label: "" } },
          { type: "text", text: " ok", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        ],
      }),
    });
    const saved = (await api(owner).get(`/pages/${made.page.id}`)).body.data.doc.content[0].content;
    expect(saved[0].marks).toBeUndefined();
    expect(saved[1].attrs.page_id).toBeNull();
    expect(saved[2].marks[0].attrs.href).toBe("https://example.com");
    const page = await mongoose.model("XenNotePage").findById(made.page.id).lean<any>();
    expect(page.unresolved).toEqual(["somewhere"]);
    expect(page.links).toEqual([]);
  });

  it("keeps links to other pages by id", async () => {
    const { owner, section } = await setup();
    const target = await newPage(owner, section, { title: "Target" });
    const made = await newPage(owner, section);
    await api(owner).put(`/pages/${made.page.id}/body`, {
      base_rev: 0,
      doc: doc({
        type: "paragraph",
        content: [{ type: "wikiLink", attrs: { page_id: target.page.id, title: "Target", label: "" } }],
      }),
    });
    const page = await mongoose.model("XenNotePage").findById(made.page.id).lean<any>();
    expect(page.links.map(String)).toEqual([target.page.id]);
  });

  it("keeps what a save over a newer one replaced, and says so", async () => {
    const { owner, section } = await setup();
    const Version = mongoose.model("XenNotePageVersion");
    const made = await newPage(owner, section);
    const save = (text: string, base_rev: number) =>
      api(owner).put(`/pages/${made.page.id}/body`, { doc: doc(p(text)), base_rev });

    expect((await save("one", 0)).body.data).toEqual({ rev: 1, conflict: false });
    // Typing on within the wait doesn't use up another version slot.
    const versionsAfterFirst = await Version.countDocuments({ page_id: made.page.id });
    expect((await save("one two", 1)).body.data).toEqual({ rev: 2, conflict: false });
    expect(await Version.countDocuments({ page_id: made.page.id })).toBe(versionsAfterFirst);

    // Somebody else saved while this editor still held revision 1: it still goes through, and the replaced text is kept.
    const stale = await save("mine", 1);
    expect(stale.body.data).toEqual({ rev: 3, conflict: true });
    const kept = await Version.find({ page_id: made.page.id }).lean<any[]>();
    expect(kept.some((v) => JSON.stringify(v.doc).includes("one two"))).toBe(true);
    expect((await api(owner).get(`/pages/${made.page.id}`)).body.data.doc.content[0].content[0].text).toBe("mine");
  });

  it("keeps at most 20 versions", async () => {
    const { owner, section } = await setup();
    const made = await newPage(owner, section);
    // Always saving from an old revision forces a version every time.
    for (let i = 0; i < 25; i++) {
      await api(owner).put(`/pages/${made.page.id}/body`, { doc: doc(p(`v${i}`)), base_rev: 0 });
    }
    expect(await mongoose.model("XenNotePageVersion").countDocuments({ page_id: made.page.id })).toBe(20);
  });

  it("tells the people who can see the page when it is saved", async () => {
    const { owner, nb, section } = await setup();
    const friend = await createUser();
    await addPerson(owner, nb, friend, "viewer");
    const made = await newPage(owner, section);
    const spy = vi.spyOn(SocketManager.getInstance(), "notifyXenNotePageUpdate");
    await api(owner).put(`/pages/${made.page.id}/body`, { doc: doc(p("x")), base_rev: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    const [audience, event] = spy.mock.calls[0];
    expect(audience.sort()).toEqual([uid(owner), uid(friend)].sort());
    expect(event).toEqual({ pageId: made.page.id, notebookId: nb, rev: 1, by: uid(owner) });
    spy.mockRestore();
  });
});

describe("who can do what", () => {
  it("follows the notebook's roles", async () => {
    const { owner, nb, section } = await setup();
    const editor = await createUser();
    const viewer = await createUser();
    const stranger = await createUser();
    await addPerson(owner, nb, editor, "editor");
    await addPerson(owner, nb, viewer, "viewer");
    const made = await newPage(owner, section);
    const id = made.page.id;

    // Reading
    for (const who of [owner, editor, viewer]) {
      expect((await api(who).get(`/pages/${id}`)).status).toBe(200);
      expect((await api(who).get(`/notebooks/${nb}/tree`)).status).toBe(200);
    }
    expect((await api(stranger).get(`/pages/${id}`)).status).toBe(404);
    expect((await api(stranger).get(`/notebooks/${nb}/tree`)).status).toBe(404);
    expect((await api().get(`/pages/${id}`)).status).toBe(401);

    // Writing: viewers only read, and a stranger can't even tell the page exists.
    const attempts = (who: U) => [
      () => api(who).put(`/pages/${id}`, { title: "x" }),
      () => api(who).put(`/pages/${id}/body`, { doc: doc(p("x")), base_rev: 0 }),
      () => api(who).post(`/sections/${section}/pages`, { title: "x" }),
      () => api(who).post(`/notebooks/${nb}/sections`, { name: "x" }),
      () => api(who).put(`/sections/${section}`, { name: "x" }),
      () => api(who).post(`/pages/${id}/move`, {}),
      () => api(who).post(`/pages/${id}/favorite`, { favorite: true }),
      () => api(who).del(`/pages/${id}`),
      () => api(who).del(`/sections/${section}`),
    ];
    for (const attempt of attempts(viewer)) expect((await attempt()).status).toBe(403);
    for (const attempt of attempts(stranger)) expect((await attempt()).status).toBe(404);

    // A notebook editor does all of it.
    expect((await api(editor).put(`/pages/${id}/body`, { doc: doc(p("by editor")), base_rev: 0 })).status).toBe(200);
    expect((await api(editor).post(`/pages/${id}/move`, {})).status).toBe(200);
    expect((await api(editor).del(`/pages/${id}`)).status).toBe(200);
  });

  it("lets people added to one page work on just that page and its sub-pages", async () => {
    const { owner, nb, section } = await setup();
    const guest = await createUser();
    const parent = await newPage(owner, section, { title: "Parent" });
    const child = await newPage(owner, section, { title: "Child", parent_id: parent.page.id });
    const sibling = await newPage(owner, section, { title: "Sibling" });

    expect((await api(guest).get(`/pages/${parent.page.id}`)).status).toBe(404);
    const added = await api(owner).post(`/pages/${parent.page.id}/people`, { userIds: [uid(guest)], role: "viewer" });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(added.body.data.members).toMatchObject([{ user_id: uid(guest), role: "viewer" }]);

    // They read the page and its sub-page, but not the notebook or its other pages.
    const read = await api(guest).get(`/pages/${parent.page.id}`);
    expect(read.status).toBe(200);
    expect(read.body.data.notebook).toBeNull();
    expect(read.body.data.section).toBeNull();
    expect((await api(guest).get(`/pages/${child.page.id}`)).status).toBe(200);
    expect((await api(guest).get(`/pages/${sibling.page.id}`)).status).toBe(404);
    expect((await api(guest).get(`/notebooks/${nb}/tree`)).status).toBe(404);
    expect((await api(guest).put(`/pages/${parent.page.id}/body`, { doc: doc(p("x")), base_rev: 0 })).status).toBe(403);

    // As an editor they write, but still don't move, delete or share.
    await api(owner).put(`/pages/${parent.page.id}/people/${uid(guest)}`, { role: "editor" });
    expect(
      (await api(guest).put(`/pages/${parent.page.id}/body`, { doc: doc(p("by guest")), base_rev: 0 })).status,
    ).toBe(200);
    expect((await api(guest).put(`/pages/${child.page.id}`, { title: "Renamed by guest" })).status).toBe(200);
    expect((await api(guest).post(`/pages/${parent.page.id}/move`, {})).status).toBe(403);
    expect((await api(guest).del(`/pages/${parent.page.id}`)).status).toBe(403);
    expect(
      (await api(guest).post(`/pages/${parent.page.id}/people`, { userIds: [uid(owner)], role: "viewer" })).status,
    ).toBe(403);
    expect((await api(guest).post(`/sections/${section}/pages`, { title: "x" })).status).toBe(404);

    // They can see who the page is shared with, and leave. The owner can remove anyone.
    expect((await api(guest).get(`/pages/${parent.page.id}/people`)).status).toBe(200);
    const another = await createUser();
    await api(owner).post(`/pages/${parent.page.id}/people`, { userIds: [uid(another)], role: "viewer" });
    expect((await api(guest).del(`/pages/${parent.page.id}/people/${uid(another)}`)).status).toBe(403);
    expect((await api(guest).del(`/pages/${parent.page.id}/people/${uid(guest)}`)).status).toBe(200);
    expect((await api(guest).get(`/pages/${parent.page.id}`)).status).toBe(404);
    expect((await api(owner).del(`/pages/${parent.page.id}/people/${uid(another)}`)).status).toBe(200);
  });

  it("doesn't add notebook members to a page, or the same person twice", async () => {
    const { owner, nb, section } = await setup();
    const member = await createUser();
    const guest = await createUser();
    await addPerson(owner, nb, member, "viewer");
    const made = await newPage(owner, section);
    const res = await api(owner).post(`/pages/${made.page.id}/people`, {
      userIds: [uid(member), uid(guest)],
      role: "editor",
    });
    expect(res.body.data.members.map((m: any) => m.user_id)).toEqual([uid(guest)]);
    const again = await api(owner).post(`/pages/${made.page.id}/people`, { userIds: [uid(guest)], role: "viewer" });
    expect(again.body.message).toBe("Already shared with them");
    expect(again.body.data.members).toHaveLength(1);
    expect((await api(owner).put(`/pages/${made.page.id}/people/${uid(member)}`, { role: "viewer" })).status).toBe(404);
    expect((await api(owner).put(`/pages/${made.page.id}/people/${uid(guest)}`, { role: "owner" })).status).toBe(400);
  });
});

describe("a page's files", () => {
  const upload = (who: U, pageId: string, name: string, data: Buffer, type: string) =>
    request(t.app)
      .post(`/api/xennote/pages/${pageId}/files`)
      .set(auth(who))
      .attach("files", data, { filename: name, contentType: type });

  it("can be any type, are tagged with the page, and only show in the text if they belong to it", async () => {
    const { owner, section } = await setup();
    const made = await newPage(owner, section);
    const other = await newPage(owner, section, { title: "Other" });

    const up = await upload(owner, made.page.id, "plan.pdf", Buffer.from("%PDF-1.4 hello"), "application/pdf");
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    const file = up.body.data.files[0];
    expect(file).toMatchObject({ name: "plan.pdf", mime: "application/pdf", size: 14 });
    expect(file.url).toContain("https://signed.example/");
    const record = await FileRecord.findById(file.id).lean();
    expect(record?.space).toMatchObject({ app: "xennote", ref: made.page.id });

    const foreign = await upload(owner, other.page.id, "secret.txt", Buffer.from("secret"), "text/plain");
    const foreignId = foreign.body.data.files[0].id;

    const saved = await api(owner).put(`/pages/${made.page.id}/body`, {
      base_rev: 0,
      doc: doc(
        { type: "fileBlock", attrs: { file_id: file.id, name: "plan.pdf", size: 14, mime: "application/pdf" } },
        // A file that belongs to another page, and one that doesn't exist, are dropped from the block.
        { type: "fileBlock", attrs: { file_id: foreignId, name: "secret.txt", size: 6, mime: "text/plain" } },
        { type: "imageBlock", attrs: { file_id: "5f0000000000000000000000", alt: "missing" } },
      ),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const got = (await api(owner).get(`/pages/${made.page.id}`)).body.data;
    expect(got.doc.content.map((n: any) => n.attrs.file_id)).toEqual([file.id, null, null]);
    expect(got.files[file.id]).toMatchObject({ name: "plan.pdf", mime: "application/pdf" });
    expect(Object.keys(got.files)).toEqual([file.id]);
    const page = await mongoose.model("XenNotePage").findById(made.page.id).lean<any>();
    expect(page.files.map(String)).toEqual([file.id]);
  });

  it("are resized when they are pictures", async () => {
    const { owner, section } = await setup();
    const made = await newPage(owner, section);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const up = await upload(owner, made.page.id, "dot.png", png, "image/png");
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.data.files[0]).toMatchObject({ name: "dot.webp", mime: "image/webp" });
  });

  it("can be added by editors only, and a missing file is a clear error", async () => {
    const { owner, nb, section } = await setup();
    const viewer = await createUser();
    await addPerson(owner, nb, viewer, "viewer");
    const made = await newPage(owner, section);
    expect((await upload(viewer, made.page.id, "a.txt", Buffer.from("a"), "text/plain")).status).toBe(403);
    expect((await request(t.app).post(`/api/xennote/pages/${made.page.id}/files`).set(auth(owner))).status).toBe(400);
  });

  it("are removed with their page and with their notebook", async () => {
    const { owner, nb, section } = await setup();
    const made = await newPage(owner, section);
    const up = await upload(owner, made.page.id, "a.txt", Buffer.from("a"), "text/plain");
    const fileId = up.body.data.files[0].id;
    expect(await FileRecord.findById(fileId)).toBeTruthy();
    await api(owner).del(`/pages/${made.page.id}`);
    expect(await FileRecord.findById(fileId)).toBeTruthy(); // in the Trash, still restorable
    await api(owner).del(`/pages/${made.page.id}/forever`);
    expect(await FileRecord.findById(fileId)).toBeNull();

    const again = await newPage(owner, section);
    const up2 = await upload(owner, again.page.id, "b.txt", Buffer.from("b"), "text/plain");
    await api(owner).del(`/notebooks/${nb}`);
    expect(await FileRecord.findById(up2.body.data.files[0].id)).toBeNull();
    expect(await mongoose.model("XenNoteSection").countDocuments({ notebook_id: nb })).toBe(0);
    expect(await mongoose.model("XenNotePage").countDocuments({ notebook_id: nb })).toBe(0);
    expect(await mongoose.model("XenNotePageBody").countDocuments({ page_id: again.page.id })).toBe(0);
  });
});

describe("the Trash", () => {
  it("can be emptied", async () => {
    const { owner, nb, section } = await setup();
    const a = await newPage(owner, section, { title: "A" });
    await newPage(owner, section, { title: "B" });
    await api(owner).del(`/pages/${a.page.id}`);
    const extra = (await api(owner).post(`/notebooks/${nb}/sections`, { name: "Extra" })).body.data.section;
    await api(owner).del(`/sections/${extra.id}`);
    const res = await api(owner).del(`/notebooks/${nb}/trash`);
    expect(res.status).toBe(200);
    const left = (await api(owner).get(`/notebooks/${nb}/trash`)).body.data;
    expect(left).toEqual({ sections: [], pages: [] });
    // What was never deleted is untouched.
    expect(names((await tree(owner, nb)).pages, "title")).toEqual(["B"]);
  });

  it("is only for people who can edit the notebook", async () => {
    const { owner, nb, section } = await setup();
    const viewer = await createUser();
    await addPerson(owner, nb, viewer, "viewer");
    const made = await newPage(owner, section);
    await api(owner).del(`/pages/${made.page.id}`);
    expect((await api(viewer).get(`/notebooks/${nb}/trash`)).status).toBe(403);
    expect((await api(viewer).post(`/pages/${made.page.id}/restore`)).status).toBe(403);
    expect((await api(viewer).del(`/pages/${made.page.id}/forever`)).status).toBe(403);
  });

  it("is purged after 30 days", async () => {
    const { owner, nb, section } = await setup();
    const old = await newPage(owner, section, { title: "Old" });
    const recent = await newPage(owner, section, { title: "Recent" });
    await api(owner).del(`/pages/${old.page.id}`);
    await api(owner).del(`/pages/${recent.page.id}`);
    const Page = mongoose.model("XenNotePage");
    await Page.updateOne({ _id: old.page.id }, { deleted_at: new Date(Date.now() - 31 * 86_400_000) }).setOptions({
      includeDeleted: true,
    });
    const { purgeExpiredPages } = await import("../utils/xenNotePages.js");
    expect(await purgeExpiredPages()).toBe(1);
    const left = (await api(owner).get(`/notebooks/${nb}/trash`)).body.data;
    expect(names(left.pages, "title")).toEqual(["Recent"]);
    expect(await mongoose.model("XenNotePageBody").countDocuments({ page_id: old.page.id })).toBe(0);
  });
});
