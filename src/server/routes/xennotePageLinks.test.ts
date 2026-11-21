import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Links between pages, suggestions, "linked from", "Link it" and search, through the real routes, models and validation
// against an in-memory database. The point of most of these is access: nothing about a page someone can't open may show.

vi.mock("../utils/storageUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToStorage: vi.fn(async () => undefined),
  deleteFromStorage: vi.fn(async () => undefined),
  generateSignedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./xennote/index.js"),
    () => import("./search.js"),
    () => import("./xendrive.js"),
    () => import("./storage.js"),
  ]);
  await mongoose.model("XenNotePage").init();
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who?: U) => {
  const h = (r: request.Test) => (who ? r.set(auth(who)) : r);
  return {
    get: (url: string, query?: object) =>
      h(
        request(t.app)
          .get(`/api/xennote${url}`)
          .query(query ?? {}),
      ),
    post: (url: string, body?: object) => h(request(t.app).post(`/api/xennote${url}`)).send(body),
    put: (url: string, body: object) => h(request(t.app).put(`/api/xennote${url}`)).send(body),
  };
};
const uid = (u: U) => String(u.user._id);

const text = (t: string) => ({ type: "text", text: t });
const para = (...content: object[]) => ({ type: "paragraph", content });
const doc = (...content: object[]) => ({ type: "doc", content });
const link = (page_id: string | null, title: string, label = "") => ({
  type: "wikiLink",
  attrs: { page_id, title, label },
});

/** A notebook with one section. */
async function book(owner: U, name = "Work") {
  const nb = (await api(owner).post("/notebooks", { name })).body.data.notebook._id as string;
  const section = (await api(owner).post(`/notebooks/${nb}/sections`, { name: "Notes" })).body.data.section
    .id as string;
  return { nb, section };
}
/** A page with a title and (optionally) some text. */
async function page(who: U, section: string, title: string, body?: object, extra: object = {}) {
  const made = await api(who).post(`/sections/${section}/pages`, { title });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const id = made.body.data.page.id as string;
  if (Object.keys(extra).length) await api(who).put(`/pages/${id}`, extra);
  if (body) {
    const saved = await api(who).put(`/pages/${id}/body`, { doc: body, base_rev: 0 });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  }
  return id;
}
const addPerson = (owner: U, nb: string, who: U, role: "editor" | "viewer") =>
  api(owner).post(`/notebooks/${nb}/members`, { userIds: [uid(who)], role });
const ids = (r: { body: { data: { pages: Array<{ id: string }> } } }) => r.body.data.pages.map((p) => p.id);
const titlesOf = (r: { body: { data: { pages: Array<{ title: string }> } } }) => r.body.data.pages.map((p) => p.title);

describe("peek", () => {
  it("names the pages the person can see and answers 'locked' for every other id alike", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { section } = await book(owner);
    const mine = await page(owner, section, "Visible page");
    const missing = "5f0000000000000000000000";

    const forOwner = await api(owner).post("/pages/peek", { ids: [mine, missing] });
    expect(forOwner.body.data.pages[0]).toMatchObject({ id: mine, locked: false, title: "Visible page" });
    expect(forOwner.body.data.pages[1]).toEqual({ id: missing, locked: true });

    // A stranger gets the same answer for a real page as for one that doesn't exist.
    const forStranger = await api(stranger).post("/pages/peek", { ids: [mine, missing] });
    expect(forStranger.body.data.pages).toEqual([
      { id: mine, locked: true },
      { id: missing, locked: true },
    ]);
  });

  it("locks all pages for legacy page-only guests", async () => {
    const owner = await createUser();
    const guest = await createUser();
    const { section } = await book(owner);
    const parent = await page(owner, section, "Parent");
    const child = await page(owner, section, "Former sub-page");
    const sibling = await page(owner, section, "Sibling");
    await mongoose
      .model("XenNotePage")
      .updateOne({ _id: parent }, { members: [{ user_id: uid(guest), role: "viewer" }] });
    const res = await api(guest).post("/pages/peek", { ids: [parent, child, sibling] });
    expect(res.body.data.pages.map((p: any) => p.locked)).toEqual([true, true, true]);
  });

  it("hides trashed pages and refuses bad input", async () => {
    const owner = await createUser();
    const { section } = await book(owner);
    const gone = await page(owner, section, "Gone");
    await request(t.app).delete(`/api/xennote/pages/${gone}`).set(auth(owner));
    expect((await api(owner).post("/pages/peek", { ids: [gone] })).body.data.pages).toEqual([
      { id: gone, locked: true },
    ]);
    expect((await api(owner).post("/pages/peek", { ids: [] })).status).toBe(400);
    expect((await api(owner).post("/pages/peek", { ids: ["nope"] })).status).toBe(400);
    expect((await api().post("/pages/peek", { ids: [gone] })).status).toBe(401);
  });
});

describe("suggest", () => {
  it("offers pages by title or alias, this notebook's first, and never one the person can't see", async () => {
    const owner = await createUser();
    const other = await createUser();
    const a = await book(owner, "Work");
    const b = await book(owner, "Home");
    const hidden = await book(other, "Theirs");
    await page(owner, b.section, "Risk plan at home");
    await page(owner, a.section, "Risk register", undefined, { aliases: ["hazards"] });
    await page(other, hidden.section, "Risk of the other person");

    const res = await api(owner).get("/pages/suggest", { q: "risk", notebook: a.nb });
    expect(titlesOf(res)).toEqual(["Risk register", "Risk plan at home"]);
    expect(res.body.data.pages[0]).toMatchObject({ notebook_name: "Work", section_name: "Notes", in_notebook: true });

    // By alias, and the alias that matched is reported.
    const byAlias = await api(owner).get("/pages/suggest", { q: "hazard" });
    expect(titlesOf(byAlias)).toEqual(["Risk register"]);
    expect(byAlias.body.data.pages[0].matched_alias).toBe("hazards");
  });

  it("gives the most recent pages when nothing is typed, and at most ten", async () => {
    const owner = await createUser();
    const { section } = await book(owner);
    for (let i = 0; i < 12; i++) await page(owner, section, `Page ${i}`);
    const res = await api(owner).get("/pages/suggest", { q: "" });
    expect(res.body.data.pages).toHaveLength(10);
    expect(res.body.data.pages[0].title).toBe("Page 11");
  });

  it("treats the text as text, not a pattern", async () => {
    const owner = await createUser();
    const { section } = await book(owner);
    await page(owner, section, "C++ (draft)");
    expect(titlesOf(await api(owner).get("/pages/suggest", { q: "C++ (" }))).toEqual(["C++ (draft)"]);
    expect((await api(owner).get("/pages/suggest", { q: ".*" })).body.data.pages).toEqual([]);
  });
});

describe("linked from", () => {
  it("lists the pages that link here by id, and those that wrote the title before the page existed", async () => {
    const owner = await createUser();
    const { section } = await book(owner);
    const target = await page(owner, section, "Risk register");
    const byId = await page(
      owner,
      section,
      "Weekly sync",
      doc(para(text("see "), link(target, "Risk register"), text(" now"))),
    );
    const byTitle = await page(owner, section, "Old note", doc(para(link(null, "risk REGISTER"))));
    await page(owner, section, "Unrelated", doc(para(text("nothing here"))));

    const res = await api(owner).get(`/pages/${target}/backlinks`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res).sort()).toEqual([byId, byTitle].sort());
    expect(res.body.data.pages.find((p: any) => p.id === byId).snippet).toContain("Risk register");
  });

  it("includes a link written with an alias, and leaves out pages the person can't see", async () => {
    const owner = await createUser();
    const friend = await createUser();
    const a = await book(owner, "Shared");
    const b = await book(owner, "Private");
    await addPerson(owner, a.nb, friend, "viewer");
    const target = await page(owner, a.section, "Target", undefined, { aliases: ["the goal"] });
    const visible = await page(owner, a.section, "Visible source", doc(para(link(target, "Target"))));
    await page(owner, b.section, "Private source", doc(para(link(target, "Target"))));
    await page(owner, a.section, "By alias", doc(para(link(null, "The Goal"))));

    expect(titlesOf(await api(owner).get(`/pages/${target}/backlinks`)).sort()).toEqual([
      "By alias",
      "Private source",
      "Visible source",
    ]);
    // The friend isn't in the private notebook: they never learn that page exists.
    const forFriend = await api(friend).get(`/pages/${target}/backlinks`);
    expect(titlesOf(forFriend).sort()).toEqual(["By alias", "Visible source"]);
    expect(ids(forFriend)).toContain(visible);
  });

  it("needs access to the page itself", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { section } = await book(owner);
    const target = await page(owner, section, "Target");
    expect((await api(stranger).get(`/pages/${target}/backlinks`)).status).toBe(404);
    expect((await api().get(`/pages/${target}/backlinks`)).status).toBe(401);
    expect((await api(owner).get(`/pages/not-an-id/backlinks`)).status).toBe(400);
  });
});

describe("unlinked references and Link it", () => {
  it("finds pages that name this page without linking to it, and links the mention", async () => {
    const owner = await createUser();
    const { section } = await book(owner);
    const target = await page(owner, section, "Risk register");
    const mention = await page(
      owner,
      section,
      "Sync notes",
      doc(para(text("Please review the risk register before Friday. Risk register again."))),
    );
    await page(owner, section, "Already linked", doc(para(text("the risk register "), link(target, "Risk register"))));
    await page(owner, section, "Near miss", doc(para(text("the risk registers and asterisks"))));

    const before = await api(owner).get(`/pages/${target}/unlinked`);
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    expect(ids(before)).toEqual([mention]);
    expect(before.body.data.pages[0]).toMatchObject({ title: "Sync notes", can_edit: true });
    expect(before.body.data.pages[0].snippet).toContain("risk register");

    const done = await api(owner).post(`/pages/${mention}/link-mention`, { target_id: target });
    expect(done.status, JSON.stringify(done.body)).toBe(200);

    // The mention is now a link to the page, with the words kept as the label, and the rest of the text is untouched.
    const saved = (await api(owner).get(`/pages/${mention}`)).body.data;
    const parts = saved.doc.content[0].content;
    expect(parts[0].text).toBe("Please review the ");
    expect(parts[1]).toEqual({
      type: "wikiLink",
      attrs: { page_id: target, title: "Risk register", label: "risk register" },
    });
    expect(parts[2].text).toBe(" before Friday. Risk register again.");
    expect(saved.page.rev).toBe(2);

    // …so it now counts as linked from, and is no longer an unlinked mention.
    expect(ids(await api(owner).get(`/pages/${target}/unlinked`))).toEqual([]);
    expect(ids(await api(owner).get(`/pages/${target}/backlinks`))).toContain(mention);
    // What it replaced is kept as a version.
    expect(await mongoose.model("XenNotePageVersion").countDocuments({ page_id: mention })).toBeGreaterThan(0);
  });

  it("finds a mention by an alias", async () => {
    const owner = await createUser();
    const { section } = await book(owner);
    const target = await page(owner, section, "Risk register", undefined, { aliases: ["risks"] });
    const mention = await page(owner, section, "Other", doc(para(text("the risks are high"))));
    expect(ids(await api(owner).get(`/pages/${target}/unlinked`))).toEqual([mention]);
    await api(owner).post(`/pages/${mention}/link-mention`, { target_id: target });
    const parts = (await api(owner).get(`/pages/${mention}`)).body.data.doc.content[0].content;
    expect(parts[1].attrs).toEqual({ page_id: target, title: "Risk register", label: "risks" });
  });

  it("is limited to the notebook, and tells a viewer they can't link it", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const a = await book(owner, "A");
    const b = await book(owner, "B");
    await addPerson(owner, a.nb, viewer, "viewer");
    const target = await page(owner, a.section, "Risk register");
    const mention = await page(owner, a.section, "Sync", doc(para(text("the risk register"))));
    await page(owner, b.section, "Elsewhere", doc(para(text("the risk register"))));

    const asViewer = await api(viewer).get(`/pages/${target}/unlinked`);
    expect(ids(asViewer)).toEqual([mention]);
    expect(asViewer.body.data.pages[0].can_edit).toBe(false);
    expect((await api(viewer).post(`/pages/${mention}/link-mention`, { target_id: target })).status).toBe(403);
  });

  it("refuses when there is nothing to link, or the target can't be seen", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const a = await book(owner, "A");
    const theirs = await book(stranger, "Theirs");
    const target = await page(owner, a.section, "Risk register");
    const nothing = await page(owner, a.section, "Plain", doc(para(text("no mention"))));
    const secret = await page(stranger, theirs.section, "Secret plan");
    const mine = await page(owner, a.section, "Mentions secret", doc(para(text("the secret plan"))));

    expect((await api(owner).post(`/pages/${nothing}/link-mention`, { target_id: target })).status).toBe(409);
    // A page the person can't see can't be linked, and the answer doesn't say whether it exists.
    expect((await api(owner).post(`/pages/${mine}/link-mention`, { target_id: secret })).status).toBe(404);
    expect(
      (await api(owner).post(`/pages/${mine}/link-mention`, { target_id: "5f0000000000000000000000" })).status,
    ).toBe(404);
    expect((await api(owner).post(`/pages/${mine}/link-mention`, { target_id: "nope" })).status).toBe(400);
  });
});

describe("search", () => {
  it("finds pages by title, alias and text, titles first, and says where each is", async () => {
    const owner = await createUser();
    const a = await book(owner, "Work");
    const byTitle = await page(owner, a.section, "Quarterly planning");
    const byAlias = await page(owner, a.section, "Roadmap", undefined, { aliases: ["quarterly goals"] });
    const byText = await page(
      owner,
      a.section,
      "Meeting",
      doc(para(text("we agreed the quarterly budget on Tuesday"))),
    );
    await page(owner, a.section, "Unrelated", doc(para(text("nothing"))));

    const res = await api(owner).get("/search", { q: "quarterly" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res)).toEqual([byTitle, byAlias, byText]);
    expect(res.body.data.pages[1].matched_alias).toBe("quarterly goals");
    expect(res.body.data.pages[2].snippet).toContain("quarterly budget");
    expect(res.body.data.pages[0]).toMatchObject({ notebook_name: "Work", section_name: "Notes", in_notebook: true });
  });

  it("can be narrowed to one notebook or one tag, and a tag alone lists its pages", async () => {
    const owner = await createUser();
    const a = await book(owner, "A");
    const b = await book(owner, "B");
    const inA = await page(owner, a.section, "Alpha plan", undefined, { tags_manual: ["q4"] });
    const inB = await page(owner, b.section, "Beta plan", undefined, { tags_manual: ["q4", "other"] });
    await page(owner, a.section, "Gamma plan");

    expect(ids(await api(owner).get("/search", { q: "plan", notebook: a.nb })).sort()).toHaveLength(2);
    expect(ids(await api(owner).get("/search", { q: "plan", tag: "Q4" })).sort()).toEqual([inA, inB].sort());
    expect(ids(await api(owner).get("/search", { tag: "#other" }))).toEqual([inB]);
    expect((await api(owner).get("/search", {})).body.data.pages).toEqual([]);
  });

  it("only ever shows pages the person can see", async () => {
    const owner = await createUser();
    const member = await createUser();
    const guest = await createUser();
    const stranger = await createUser();
    const a = await book(owner, "Shared book");
    const b = await book(owner, "Private book");
    await addPerson(owner, a.nb, member, "viewer");
    const open = await page(owner, a.section, "Findme open", doc(para(text("findme"))));
    const sharedOne = await page(owner, b.section, "Findme shared page");
    await page(owner, b.section, "Findme private");
    await mongoose
      .model("XenNotePage")
      .updateOne({ _id: sharedOne }, { members: [{ user_id: uid(guest), role: "viewer" }] });

    expect(titlesOf(await api(owner).get("/search", { q: "findme" })).sort()).toEqual([
      "Findme open",
      "Findme private",
      "Findme shared page",
    ]);
    expect(ids(await api(member).get("/search", { q: "findme" }))).toEqual([open]);
    expect(ids(await api(guest).get("/search", { q: "findme" }))).toEqual([]);
    expect(ids(await api(stranger).get("/search", { q: "findme" }))).toEqual([]);
  });

  it("is also in the hub search, linking to the page", async () => {
    const owner = await createUser();
    const guest = await createUser();
    const a = await book(owner, "Work");
    const found = await page(owner, a.section, "Zebrafish habitat", doc(para(text("notes"))));
    await addPerson(owner, a.nb, guest, "viewer");

    const hub = async (who: U) =>
      (await request(t.app).get("/api/search").query({ q: "zebrafish" }).set(auth(who))).body.data.groups as Array<{
        kind: string;
        hits: Array<{ title: string; link: string }>;
      }>;
    const mine = (await hub(owner)).find((g) => g.kind === "pages");
    expect(mine?.hits).toMatchObject([{ title: "Zebrafish habitat", link: `/internal/xennote/b/${a.nb}/p/${found}` }]);
    const theirs = (await hub(guest)).find((g) => g.kind === "pages");
    expect(theirs?.hits[0].link).toBe(`/internal/xennote/b/${a.nb}/p/${found}`);
  });
});
