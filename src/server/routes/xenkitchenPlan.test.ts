import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// The meal plan and the shopping list made from it, through the real routes and models. Only storage is faked.
vi.hoisted(() => {
  process.env.GCS_PUBLIC_BUCKET_NAME = "test-public";
  process.env.GCS_PRIVATE_BUCKET_NAME = "test-private";
});

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenkitchen.js"), () => import("./xenkitchenPlan.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xenkitchen${url}`).set(as(who)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xenkitchen${url}`).set(as(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xenkitchen${url}`).set(as(who)).send(body),
  del: (url: string) => request(t.app).delete(`/api/xenkitchen${url}`).set(as(who)),
});
const bookOf = async (who: U) => (await api(who).get("/books")).body.data.books[0]._id as string;
const recipe = async (who: U, bookId: string, title: string, ingredients: object[], servings: number | null = 4) => {
  const res = await api(who).post("/items", {
    book_id: bookId,
    title,
    servings,
    ingredients,
    steps: [{ text: "Cook it" }],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.item._id as string;
};
const plan = (who: U, bookId: string, from: string, to: string) =>
  api(who).get(`/books/${bookId}/plan?from=${from}&to=${to}`);
const add = (who: U, bookId: string, body: object) => api(who).post(`/books/${bookId}/plan`, body);
const list = (who: U, bookId: string, from: string, to: string) =>
  api(who).post(`/books/${bookId}/plan/shopping-list`, { from, to });

describe("planning meals", () => {
  it("adds a recipe to a day, lists the range in date order, and changes or removes an entry", async () => {
    const me = await createUser();
    const book = await bookOf(me);
    const pancakes = await recipe(me, book, "Pancakes", [{ name: "flour", quantity: "2", unit: "cups" }]);
    const soup = await recipe(me, book, "Soup", [{ name: "stock", quantity: "1", unit: "l" }]);

    const a = await add(me, book, { date: "2026-03-05", item_id: soup, servings: 6 });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data.entry).toMatchObject({ date: "2026-03-05", title: "Soup", servings: 6, recipe_servings: 4 });
    await add(me, book, { date: "2026-03-02", item_id: pancakes });
    await add(me, book, { date: "2026-03-20", item_id: pancakes }); // outside the range below

    const week = (await plan(me, book, "2026-03-02", "2026-03-08")).body.data.entries;
    expect(week.map((e: any) => [e.date, e.title])).toEqual([
      ["2026-03-02", "Pancakes"],
      ["2026-03-05", "Soup"],
    ]);
    expect(week[0].servings).toBeNull();

    const id = a.body.data.entry._id;
    const moved = await api(me).put(`/plan/${id}`, { date: "2026-03-03", servings: 2 });
    expect(moved.body.data.entry).toMatchObject({ date: "2026-03-03", servings: 2 });
    expect((await api(me).put(`/plan/${id}`, { servings: null })).body.data.entry.servings).toBeNull();

    expect((await api(me).del(`/plan/${id}`)).status).toBe(200);
    expect((await plan(me, book, "2026-03-02", "2026-03-08")).body.data.entries).toHaveLength(1);
    expect((await api(me).del(`/plan/${id}`)).status).toBe(404);
  });

  it("refuses bad dates, ranges and servings", async () => {
    const me = await createUser();
    const book = await bookOf(me);
    const item = await recipe(me, book, "Rice", []);
    for (const date of ["2026-3-5", "tomorrow", "2026-02-30", "2026-13-01", ""]) {
      expect((await add(me, book, { date, item_id: item })).status, date).toBe(400);
    }
    for (const servings of [0, -1, 0.1, 5000, "four"]) {
      expect((await add(me, book, { date: "2026-03-05", item_id: item, servings })).status, String(servings)).toBe(400);
    }
    expect((await add(me, book, { date: "2026-03-05" })).status).toBe(400);
    expect((await plan(me, book, "2026-03-08", "2026-03-02")).status).toBe(400); // end before start
    expect((await plan(me, book, "2026-01-01", "2026-04-01")).status).toBe(400); // more than 62 days
    expect((await plan(me, book, "2026-03-02", "nope")).status).toBe(400);
    expect((await api(me).put(`/plan/${"a".repeat(24)}`, {})).status).toBe(400); // nothing to change
    expect((await plan(me, book, "2026-03-01", "2026-04-30")).status).toBe(200); // exactly 61 days is fine
  });

  it("only takes a recipe that is in this book, and no more than 12 meals a day", async () => {
    const me = await createUser();
    const book = await bookOf(me);
    const other = (await api(me).post("/books", { name: "Other" })).body.data.book._id as string;
    const here = await recipe(me, book, "Here", []);
    const there = await recipe(me, other, "There", []);
    expect((await add(me, book, { date: "2026-03-05", item_id: there })).status).toBe(404);
    for (let i = 0; i < 12; i++) expect((await add(me, book, { date: "2026-03-05", item_id: here })).status).toBe(201);
    const full = await add(me, book, { date: "2026-03-05", item_id: here });
    expect(full.status).toBe(400);
    expect(full.body.message).toMatch(/up to 12/);
    expect((await add(me, book, { date: "2026-03-06", item_id: here })).status).toBe(201);
  });

  it("drops an entry once its recipe is deleted or moved to another book", async () => {
    const me = await createUser();
    const book = await bookOf(me);
    const other = (await api(me).post("/books", { name: "Other" })).body.data.book._id as string;
    const gone = await recipe(me, book, "Gone", []);
    const moved = await recipe(me, book, "Moved", []);
    const kept = await recipe(me, book, "Kept", []);
    for (const id of [gone, moved, kept]) await add(me, book, { date: "2026-03-05", item_id: id });

    await api(me).del(`/items/${gone}`);
    const move = await api(me).put(`/items/${moved}/move`, { book_id: other });
    expect(move.status, JSON.stringify(move.body)).toBe(200);
    expect((await plan(me, book, "2026-03-05", "2026-03-05")).body.data.entries.map((e: any) => e.title)).toEqual([
      "Kept",
    ]);
  });
});

describe("who can see and change a plan", () => {
  it("is shared with the book: editors change it, viewers read it, strangers see nothing", async () => {
    const [owner, editor, viewer, stranger] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);
    const book = await bookOf(owner);
    const item = await recipe(owner, book, "Stew", [{ name: "beef", quantity: "500", unit: "g" }]);
    for (const [who, role] of [
      [editor, "editor"],
      [viewer, "viewer"],
    ] as const) {
      const added = await api(owner).post(`/books/${book}/members`, { userIds: [String(who.user._id)], role });
      expect(added.status, JSON.stringify(added.body)).toBe(200);
    }
    const entry = (await add(owner, book, { date: "2026-03-05", item_id: item })).body.data.entry._id;

    expect((await add(editor, book, { date: "2026-03-06", item_id: item })).status).toBe(201);
    expect((await plan(viewer, book, "2026-03-01", "2026-03-31")).body.data.entries).toHaveLength(2);
    expect((await list(viewer, book, "2026-03-01", "2026-03-31")).status).toBe(200);

    expect((await add(viewer, book, { date: "2026-03-07", item_id: item })).status).toBe(403);
    expect((await api(viewer).put(`/plan/${entry}`, { servings: 3 })).status).toBe(403);
    expect((await api(viewer).del(`/plan/${entry}`)).status).toBe(403);

    expect((await plan(stranger, book, "2026-03-01", "2026-03-31")).status).toBe(404);
    expect((await add(stranger, book, { date: "2026-03-07", item_id: item })).status).toBe(404);
    expect((await list(stranger, book, "2026-03-01", "2026-03-31")).status).toBe(404);
    expect((await api(stranger).put(`/plan/${entry}`, { servings: 3 })).status).toBe(404);
    expect((await api(stranger).del(`/plan/${entry}`)).status).toBe(404);
    expect((await plan(owner, book, "2026-03-01", "2026-03-31")).body.data.entries).toHaveLength(2); // nothing changed
  });

  it("needs sign-in", async () => {
    const me = await createUser();
    const book = await bookOf(me);
    expect((await request(t.app).get(`/api/xenkitchen/books/${book}/plan?from=2026-03-01&to=2026-03-02`)).status).toBe(
      401,
    );
    expect(
      (
        await request(t.app)
          .post(`/api/xenkitchen/books/${book}/plan/shopping-list`)
          .send({ from: "2026-03-01", to: "2026-03-02" })
      ).status,
    ).toBe(401);
  });
});

describe("the shopping list", () => {
  it("adds up the planned meals, scaled to the servings planned, for just the days asked for", async () => {
    const me = await createUser();
    const book = await bookOf(me);
    const pancakes = await recipe(
      me,
      book,
      "Pancakes",
      [
        { name: "flour", quantity: "1 1/2", unit: "cups" },
        { name: "eggs", quantity: "2", unit: "" },
        { name: "salt", quantity: "", unit: "" },
      ],
      4,
    );
    const bread = await recipe(
      me,
      book,
      "Bread",
      [
        { name: "Flour", quantity: "3", unit: "cups" },
        { name: "yeast", quantity: "1", unit: "tsp" },
      ],
      2,
    );
    await add(me, book, { date: "2026-03-02", item_id: pancakes, servings: 8 }); // double: 3 cups flour, 4 eggs
    await add(me, book, { date: "2026-03-04", item_id: bread }); // as written: 3 cups flour
    await add(me, book, { date: "2026-03-30", item_id: bread }); // outside the range

    const res = await list(me, book, "2026-03-02", "2026-03-08");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ from: "2026-03-02", to: "2026-03-08", meals: 2 });
    expect(res.body.data.lines).toEqual([
      { name: "eggs", quantity: "4", unit: "", sources: ["Pancakes"] },
      { name: "flour", quantity: "6", unit: "cups", sources: ["Pancakes", "Bread"] },
      { name: "salt", quantity: "", unit: "", sources: ["Pancakes"] },
      { name: "yeast", quantity: "1", unit: "tsp", sources: ["Bread"] },
    ]);
  });

  it("is empty for a range with no meals, and doesn't store anything", async () => {
    const me = await createUser();
    const book = await bookOf(me);
    const res = await list(me, book, "2026-03-02", "2026-03-08");
    expect(res.body.data).toEqual({ from: "2026-03-02", to: "2026-03-08", meals: 0, lines: [] });
    expect((await list(me, book, "2026-03-08", "2026-03-02")).status).toBe(400);
  });
});
