import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Search covers the caller's own recipes and other people's public ones, and treats the term as text, not a pattern.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./recipaint.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("recipaint search", () => {
  it("filters public recipes by title and treats the term literally", async () => {
    const author = await createUser();
    const reader = await createUser();
    const as = (u: typeof author) => ({ Authorization: `Bearer ${u.token}` });
    for (const title of ["Rusty armour", "Green skin"]) {
      const res = await request(t.app).post("/api/recipaint").set(as(author)).send({ title, isPublic: true });
      expect(res.status).toBe(200);
    }

    const hit = await request(t.app).get("/api/recipaint/public?search=rusty").set(as(reader));
    expect(hit.body.data.recipes.map((r: { title: string }) => r.title)).toEqual(["Rusty armour"]);

    const all = await request(t.app).get("/api/recipaint/public").set(as(reader));
    expect(all.body.data.recipes).toHaveLength(2);

    const pattern = await request(t.app).get("/api/recipaint/public?search=.*").set(as(reader));
    expect(pattern.body.data.recipes).toHaveLength(0);
  });
});
