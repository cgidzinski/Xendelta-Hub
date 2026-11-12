import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// People: who you know (derived from shared spaces), the safe search, and public profiles. Real routes and models
// against an in-memory MongoDB.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./people.js"),
    () => import("./users.js"),
    () => import("./xensplit.js"),
    () => import("./xenbudget/index.js"),
    () => import("./chat/index.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => u.user._id.toString();
const named = async (username: string) => createUser({ username });

const makeGroup = async (owner: U, others: U[], name = "Trip") =>
  (
    await request(t.app)
      .post("/api/xensplit/groups")
      .set(as(owner.token))
      .send({ name, memberIds: others.map(id) })
  ).body;

describe("who you know", () => {
  it("is everyone you share a space with, most shared first, never yourself", async () => {
    const [me, a, b, stranger] = [await createUser(), await createUser(), await createUser(), await createUser()];
    await makeGroup(me, [a, b], "Trip");
    const book = await request(t.app)
      .post("/api/xenbudget/books")
      .set(as(me.token))
      .send({ name: "Home", memberIds: [id(a)] });
    expect(book.status, JSON.stringify(book.body)).toBe(200);

    const res = await request(t.app).get("/api/people").set(as(me.token));
    expect(res.status).toBe(200);
    const people = res.body.data.people as Array<{ _id: string; sharedCount: number; apps: string[] }>;
    expect(people.map((p) => p._id)).toEqual([id(a), id(b)]);
    expect(people[0]).toMatchObject({ sharedCount: 2, apps: ["XenBudget", "XenSplit"] });
    expect(people[1]).toMatchObject({ sharedCount: 1, apps: ["XenSplit"] });
    expect(people.some((p) => p._id === id(stranger) || p._id === id(me))).toBe(false);
  });

  it("is empty for someone who shares nothing", async () => {
    const lonely = await createUser();
    const res = await request(t.app).get("/api/people").set(as(lonely.token));
    expect(res.body.data.people).toEqual([]);
  });

  it("includes chat partners", async () => {
    const [me, b] = [await createUser(), await createUser()];
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(me.token))
      .send({ userIds: [id(b)] });
    const res = await request(t.app).get("/api/people").set(as(me.token));
    expect(res.body.data.people.map((p: any) => p._id)).toEqual([id(b)]);
  });
});

describe("messaging from a profile", () => {
  it("opens the chat you already have with them instead of making another", async () => {
    const [me, them] = [await createUser(), await createUser()];
    const first = await request(t.app)
      .post("/api/chat/conversations")
      .set(as(me.token))
      .send({ userIds: [id(them)] });
    const again = await request(t.app)
      .post("/api/chat/conversations")
      .set(as(me.token))
      .send({ userIds: [id(them)] });
    expect(again.body.data.conversation._id).toBe(first.body.data.conversation._id);
    expect(again.body.data.created).toBe(false);
  });
});

describe("search", () => {
  it("matches a username prefix, ignoring case, and never the caller", async () => {
    const me = await named("zeta_searcher");
    await named("Zeta_one");
    await named("zeta_two");
    await named("other_zeta");
    const res = await request(t.app).get("/api/users/search?q=ZETA_").set(as(me.token));
    expect(res.status).toBe(200);
    const names = res.body.data.users.map((u: any) => u.username).sort();
    expect(names).toEqual(["Zeta_one", "zeta_two"]);
  });

  it("returns nothing for fewer than two letters instead of an arbitrary slice of everyone", async () => {
    const me = await createUser();
    for (const q of ["", "a", " b "]) {
      const res = await request(t.app).get("/api/users/search").query({ q }).set(as(me.token));
      expect(res.status).toBe(200);
      expect(res.body.data.users).toEqual([]);
    }
  });

  it("treats regex characters as plain text", async () => {
    const me = await createUser();
    await named("dotty_user");
    for (const q of [".*", "(", "^d", "[a-z]+", "dot.y"]) {
      const res = await request(t.app).get("/api/users/search").query({ q }).set(as(me.token));
      expect(res.status, q).toBe(200);
      expect(res.body.data.users, q).toEqual([]);
    }
  });

  it("lists people you know before strangers", async () => {
    const me = await named("yy_me");
    const stranger = await named("yy_aaa_stranger");
    const known = await named("yy_zzz_known");
    await makeGroup(me, [known]);
    const res = await request(t.app).get("/api/users/search?q=yy_").set(as(me.token));
    expect(res.body.data.users.map((u: any) => u._id)).toEqual([id(known), id(stranger)]);
    expect(res.body.data.users[0].sharedCount).toBe(1);
    expect(res.body.data.users[1].sharedCount).toBe(0);
  });

  it("carries only public fields", async () => {
    const me = await createUser();
    await named("pub_check");
    const res = await request(t.app).get("/api/users/search?q=pub_").set(as(me.token));
    for (const u of res.body.data.users) {
      for (const key of ["email", "roles", "gems", "inventory", "password"]) expect(u).not.toHaveProperty(key);
    }
  });

  it("requires sign-in", async () => {
    expect((await request(t.app).get("/api/users/search?q=ab")).status).toBe(401);
  });
});

describe("profiles", () => {
  it("shows any signed-in user the public fields and the spaces you share", async () => {
    const [me, them, other] = [await createUser(), await createUser(), await createUser()];
    await makeGroup(me, [them], "Ski trip");
    await makeGroup(other, [them], "Not mine");
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(me.token))
      .send({ userIds: [id(them)] });

    const res = await request(t.app)
      .get(`/api/users/${id(them)}`)
      .set(as(me.token));
    expect(res.status).toBe(200);
    expect(res.body.data.isSelf).toBe(false);
    expect(res.body.data.user).toMatchObject({ _id: id(them), username: them.user.username });
    expect(res.body.data.user.joinedAt).toMatch(/^\d{4}-/);
    for (const key of ["email", "roles", "gems", "inventory", "password"]) {
      expect(res.body.data.user).not.toHaveProperty(key);
    }
    // Only spaces both are in, and chats are left to the Message button.
    expect(res.body.data.sharedSpaces).toHaveLength(1);
    expect(res.body.data.sharedSpaces[0]).toMatchObject({ app: "xensplit", label: "XenSplit", name: "Ski trip" });
    expect(res.body.data.sharedSpaces[0].link).toMatch(/^\/internal\/xensplit\/groups\//);
  });

  it("shows a stranger with nothing shared", async () => {
    const [me, stranger] = [await createUser(), await createUser()];
    const res = await request(t.app)
      .get(`/api/users/${id(stranger)}`)
      .set(as(me.token));
    expect(res.status).toBe(200);
    expect(res.body.data.sharedSpaces).toEqual([]);
  });

  it("marks your own profile", async () => {
    const me = await createUser();
    const res = await request(t.app)
      .get(`/api/users/${id(me)}`)
      .set(as(me.token));
    expect(res.body.data).toMatchObject({ isSelf: true, sharedSpaces: [] });
  });

  it("is a 404 for an unknown person and a 400 for a bad id", async () => {
    const me = await createUser();
    expect((await request(t.app).get("/api/users/64b7f0f0f0f0f0f0f0f0f0f0").set(as(me.token))).status).toBe(404);
    expect((await request(t.app).get("/api/users/not-an-id").set(as(me.token))).status).toBe(400);
  });

  it("is no longer possible to list every user", async () => {
    const me = await createUser();
    const res = await request(t.app).get("/api/users").set(as(me.token));
    expect(res.status).toBe(404);
  });
});
