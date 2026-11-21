import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { createXenLink } from "../models/xenlink";

// Global search across the apps: what each person can open, and nothing else.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./search.js"),
    () => import("./xennote/index.js"),
    () => import("./xenkitchen.js"),
    () => import("./xenroutine.js"),
    () => import("./xensplit.js"),
    () => import("./xenbudget/index.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
const post = (u: U, url: string, body: object) => request(t.app).post(url).set(auth(u)).send(body);
const search = async (u: U, q: string) => {
  const res = await request(t.app).get("/api/search").query({ q }).set(auth(u));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.groups as Array<{
    kind: string;
    label: string;
    hits: Array<{ title: string; subtitle?: string; link: string }>;
  }>;
};
const titles = (groups: Awaited<ReturnType<typeof search>>, kind: string) =>
  groups.find((g) => g.kind === kind)?.hits.map((h) => h.title) ?? [];

/** One person with something called "Quokka" in every app. */
async function populate(who: U, suffix = "") {
  const uid = String(who.user._id);
  const note = await post(who, "/api/xennote/notes", {
    type: "text",
    title: `Quokka note${suffix}`,
    body: "about marsupials",
  });
  expect(note.status, JSON.stringify(note.body)).toBe(200);
  await post(who, "/api/xennote/notes", { type: "text", title: "Other", body: "mentions a quokka in the body" });
  const notebook = await post(who, "/api/xennote/notebooks", { name: `Quokka notebook${suffix}` });
  expect(notebook.status, JSON.stringify(notebook.body)).toBe(200);
  const { createDriveFile } = await import("../testing/files.js");
  await createDriveFile({
    owner_id: who.user._id,
    folder_id: null,
    name: `quokka${suffix}.png`,
    storage_path: `x/${uid}/q`,
    mimeType: "image/png",
    size: 3,
  });
  await createXenLink({ name: `Quokka fan page${suffix}`, url: "https://example.com/quokkas", owner_id: uid });
  const books = await request(t.app).get("/api/xenkitchen/books").set(auth(who));
  const bookId = books.body.data.books[0]._id;
  const recipe = await post(who, "/api/xenkitchen/items", {
    book_id: bookId,
    title: `Quokka stew${suffix}`,
    ingredients: [],
    steps: [{ text: "Simmer" }],
  });
  expect(recipe.status, JSON.stringify(recipe.body)).toBe(200);
  await post(who, "/api/xenroutine/routines", {
    name: `Feed the quokka${suffix}`,
    interval: { every: 1, unit: "days" },
  });
  const group = await post(who, "/api/xensplit/groups", { name: `Quokka trip${suffix}`, default_currency: "CAD" });
  const groupId = (group.body.data.group ?? group.body.data)._id;
  await post(who, `/api/xensplit/groups/${groupId}/expenses`, {
    paid_by: uid,
    amount: 12,
    currency: "CAD",
    title: `Quokka tickets${suffix}`,
    date: new Date().toISOString(),
    split_type: "equal",
    splits: [{ user_id: uid }],
  });
  const book = await post(who, "/api/xenbudget/books", { name: `Quokka budget${suffix}`, default_currency: "CAD" });
  const budgetId = (book.body.data.book ?? book.body.data)._id;
  await post(who, `/api/xenbudget/books/${budgetId}/items`, {
    type: "expense",
    amount: 9,
    description: `Quokka feed${suffix}`,
    date: new Date().toISOString(),
  });
  return { groupId, budgetId };
}

describe("searching everything", () => {
  it("finds what the caller has in every app, grouped, with where each opens", async () => {
    const me = await createUser();
    const ids = await populate(me);
    const groups = await search(me, "quokka");
    expect(groups.map((g) => g.kind).sort()).toEqual([
      "budget",
      "expenses",
      "files",
      "links",
      "notebooks",
      "notes",
      "recipes",
      "routines",
    ]);
    expect(titles(groups, "notes").sort()).toEqual(["Other", "Quokka note"]);
    expect(titles(groups, "notebooks")).toEqual(["Quokka notebook"]);
    expect(titles(groups, "files")).toEqual(["quokka.png"]);
    expect(titles(groups, "recipes")).toEqual(["Quokka stew"]);
    expect(titles(groups, "routines")).toEqual(["Feed the quokka"]);
    expect(titles(groups, "links")).toEqual(["Quokka fan page"]);
    expect(titles(groups, "expenses").sort()).toEqual(["Quokka tickets", "Quokka trip"]);
    expect(titles(groups, "budget").sort()).toEqual(["Quokka budget", "Quokka feed"]);

    const expense = groups.find((g) => g.kind === "expenses")!.hits.find((h) => h.title === "Quokka tickets")!;
    expect(expense.link).toBe(`/internal/xensplit/groups/${ids.groupId}/expenses`);
    expect(expense.subtitle).toBe("12 CAD · Quokka trip");
    // A hit in a note's body shows the words around it.
    const bodyHit = groups.find((g) => g.kind === "notes")!.hits.find((h) => h.title === "Other")!;
    expect(bodyHit.subtitle).toContain("quokka");
  });

  it("is case-insensitive, finds people by the start of their name, and treats the text as plain words", async () => {
    const me = await createUser();
    await createUser({ username: "Zebediah" });
    expect(titles(await search(me, "zebed"), "people")).toEqual(["Zebediah"]);
    expect(titles(await search(me, "ZEBED"), "people")).toEqual(["Zebediah"]);
    // Not a pattern: these would match nearly everything (or throw) if they were.
    for (const q of [".*", "a(", "[a-", "\\\\"]) expect(await search(me, q)).toEqual([]);
  });

  it("never shows someone else's things", async () => {
    const mine = await createUser();
    const theirs = await createUser();
    await populate(theirs, " (theirs)");
    expect(await search(mine, "quokka")).toEqual([]);
    await populate(mine);
    const groups = await search(mine, "quokka");
    for (const g of groups) for (const h of g.hits) expect(h.title).not.toContain("(theirs)");
  });

  it("includes things shared with the caller", async () => {
    const owner = await createUser();
    const member = await createUser();
    const note = (await post(owner, "/api/xennote/notes", { type: "text", title: "Shared quokka plan" })).body.data
      .note;
    await post(owner, `/api/xennote/notes/${note._id}/members`, { userIds: [member.user.id], role: "viewer" });
    const hit = (await search(member, "quokka")).find((g) => g.kind === "notes")!.hits[0];
    expect(hit.title).toBe("Shared quokka plan");
    expect(hit.link).toBe(`/internal/xennote?note=${note._id}`);
  });

  it("needs sign-in and at least two characters", async () => {
    const me = await createUser();
    expect((await request(t.app).get("/api/search").query({ q: "quokka" })).status).toBe(401);
    expect((await request(t.app).get("/api/search").query({ q: "q" }).set(auth(me))).status).toBe(400);
    expect((await request(t.app).get("/api/search").set(auth(me))).status).toBe(400);
    expect(
      (
        await request(t.app)
          .get("/api/search")
          .query({ q: "x".repeat(101) })
          .set(auth(me))
      ).status,
    ).toBe(400);
  });
});
