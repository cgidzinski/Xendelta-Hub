import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Pausing a link switches it off without deleting it, and several links can be deleted at once.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenlink.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const make = async (who: U, name: string) => {
  const res = await request(t.app).post("/api/xenlink").set(auth(who)).send({ name, url: "https://example.com" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};
const list = async (who: U) =>
  (await request(t.app).get("/api/xenlink/list").set(auth(who))).body.data.links as Array<{
    _id: string;
    slug: string;
    name: string;
    paused?: boolean;
  }>;

describe("pausing a link", () => {
  it("stops it working until it is resumed", async () => {
    const me = await createUser();
    await make(me, "A");
    const [link] = await list(me);
    const body = { _id: link._id, name: "A", url: "https://example.com" };

    expect((await request(t.app).get(`/api/xenlink/redirect/${link.slug}`)).status).toBe(200);

    expect(
      (
        await request(t.app)
          .put("/api/xenlink")
          .set(auth(me))
          .send({ ...body, paused: true })
      ).status,
    ).toBe(200);
    expect((await list(me))[0].paused).toBe(true);
    const page = await request(t.app).get(`/api/xenlink/redirect/${link.slug}`);
    expect(page.status).toBe(410);
    expect(page.body.message).toMatch(/paused/);
    expect((await request(t.app).post(`/api/xenlink/click/${link.slug}`)).status).toBe(410);

    // An edit that doesn't mention it leaves it paused.
    await request(t.app)
      .put("/api/xenlink")
      .set(auth(me))
      .send({ ...body, name: "A2" });
    expect((await list(me))[0].paused).toBe(true);

    await request(t.app)
      .put("/api/xenlink")
      .set(auth(me))
      .send({ ...body, paused: false });
    expect((await request(t.app).post(`/api/xenlink/click/${link.slug}`)).status).toBe(200);
  });
});

describe("deleting several links", () => {
  it("deletes the caller's links and ignores anyone else's", async () => {
    const me = await createUser();
    const other = await createUser();
    await make(me, "One");
    await make(me, "Two");
    await make(other, "Theirs");
    const mine = await list(me);
    const theirs = await list(other);

    const res = await request(t.app)
      .post("/api/xenlink/delete-many")
      .set(auth(me))
      .send({ ids: [...mine.map((l) => l._id), theirs[0]._id] });
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(2);
    expect(await list(me)).toEqual([]);
    expect(await list(other)).toHaveLength(1);
  });

  it("refuses an empty or malformed list", async () => {
    const me = await createUser();
    expect((await request(t.app).post("/api/xenlink/delete-many").set(auth(me)).send({ ids: [] })).status).toBe(400);
    expect(
      (
        await request(t.app)
          .post("/api/xenlink/delete-many")
          .set(auth(me))
          .send({ ids: ["nope"] })
      ).status,
    ).toBe(400);
  });
});
