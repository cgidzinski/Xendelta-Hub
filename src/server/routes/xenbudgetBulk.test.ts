import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Changing or deleting several items at once, through the real routes and models.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenbudget/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

async function setup() {
  const owner = await createUser();
  const created = await request(t.app)
    .post("/api/xenbudget/books")
    .set(auth(owner))
    .send({ name: "Home", default_currency: "CAD" });
  const b = `/api/xenbudget/books/${(created.body.data.book ?? created.body.data)._id}`;
  expect((await request(t.app).post(`${b}/categories`).set(auth(owner)).send({ name: "Treats" })).status).toBe(200);
  expect((await request(t.app).post(`${b}/flags`).set(auth(owner)).send({ name: "Check me" })).status).toBe(200);
  const ids: string[] = [];
  for (const description of ["Coffee", "Cake", "Gum"]) {
    const res = await request(t.app)
      .post(`${b}/items`)
      .set(auth(owner))
      .send({ type: "expense", amount: 10, description, date: new Date().toISOString() });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    ids.push(res.body.data._id);
  }
  const list = async () => (await request(t.app).get(`${b}/items`).set(auth(owner))).body.data.items as any[];
  return { owner, b, ids, list };
}

describe("bulk update", () => {
  it("categorises several items and clears their Uncategorised flag", async () => {
    const { owner, b, ids, list } = await setup();
    const res = await request(t.app)
      .post(`${b}/items/bulk-update`)
      .set(auth(owner))
      .send({ ids: ids.slice(0, 2), set_category: "treats" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.updated).toBe(2);
    const byDesc = Object.fromEntries((await list()).map((i) => [i.description, i]));
    expect(byDesc.Coffee.categories).toMatchObject([{ name: "Treats", amount: 10 }]);
    expect(byDesc.Coffee.flags).not.toContain("Uncategorised");
    expect(byDesc.Gum.categories).toEqual([]);
  });

  it("adds and removes a flag", async () => {
    const { owner, b, ids, list } = await setup();
    await request(t.app)
      .post(`${b}/items/bulk-update`)
      .set(auth(owner))
      .send({ ids, add_flags: ["Check me"] });
    expect((await list()).every((i) => i.flags.includes("Check me"))).toBe(true);
    await request(t.app)
      .post(`${b}/items/bulk-update`)
      .set(auth(owner))
      .send({ ids, remove_flags: ["check me"] });
    expect((await list()).some((i) => i.flags.includes("Check me"))).toBe(false);
  });

  it("refuses names the book doesn't have, and an empty change", async () => {
    const { owner, b, ids } = await setup();
    const post = (body: object) => request(t.app).post(`${b}/items/bulk-update`).set(auth(owner)).send(body);
    expect((await post({ ids, set_category: "Nope" })).status).toBe(400);
    expect((await post({ ids, add_flags: ["Nope"] })).status).toBe(400);
    expect((await post({ ids })).status).toBe(400);
    expect((await post({ ids: [], set_category: "Treats" })).status).toBe(400);
  });

  it("is for members only", async () => {
    const { b, ids } = await setup();
    const stranger = await createUser();
    const res = await request(t.app)
      .post(`${b}/items/bulk-update`)
      .set(auth(stranger))
      .send({ ids, set_category: "Treats" });
    expect(res.status).toBe(403);
  });
});

describe("bulk delete", () => {
  it("deletes the chosen items and leaves the rest", async () => {
    const { owner, b, ids, list } = await setup();
    const res = await request(t.app)
      .post(`${b}/items/bulk-delete`)
      .set(auth(owner))
      .send({ ids: ids.slice(0, 2) });
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(2);
    expect((await list()).map((i) => i.description)).toEqual(["Gum"]);
  });

  it("ignores ids from another book", async () => {
    const one = await setup();
    const two = await setup();
    const res = await request(t.app).post(`${two.b}/items/bulk-delete`).set(auth(two.owner)).send({ ids: one.ids });
    expect(res.body.data.deleted).toBe(0);
    expect(await one.list()).toHaveLength(3);
  });
});
