import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Requests that are malformed must be refused with a 400 before they reach a query, and ones that
// are fine must still go through. Run through the real routes so a schema that is stricter than
// what the client actually sends shows up here, not in production.

let t: TestApp;
let token: string;
let adminToken: string;

beforeAll(async () => {
  t = await startTestApp([
    () => import("./xenlink.js"),
    () => import("./points.js"),
    () => import("./users.js"),
    () => import("./xenbox.js"),
    () => import("./recipaint.js"),
    () => import("./paints.js"),
    () => import("./blog.js"),
    () => import("./admin/users.js"),
    () => import("./admin/blog.js"),
  ]);
  token = (await createUser()).token;
  adminToken = (await createUser({ roles: ["admin"] })).token;
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (tok: string) => ({ Authorization: `Bearer ${tok}` });
const BAD_ID = "not-an-object-id";

describe("path parameters must be ObjectIds", () => {
  it.each([
    ["DELETE", `/api/xenlink/${BAD_ID}`],
    ["PUT", `/api/paints/${BAD_ID}`],
    ["GET", `/api/recipaint/${BAD_ID}`],
    ["DELETE", `/api/recipaint/${BAD_ID}`],
    ["GET", `/api/xenbox/files/${BAD_ID}/url`],
    ["DELETE", `/api/user/inventory/${BAD_ID}`],
  ])("%s %s -> 400 (not a CastError 500)", async (method, url) => {
    const res = await (request(t.app) as any)[method.toLowerCase()](url).set(as(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.status).toBe(false);
  });

  it("admin routes reject a bad id too", async () => {
    const res = await request(t.app).delete(`/api/admin/users/${BAD_ID}`).set(as(adminToken));
    expect(res.status).toBe(400);
  });
});

describe("request bodies", () => {
  it("XenLink needs a name and a url", async () => {
    const bad = await request(t.app).post("/api/xenlink").set(as(token)).send({ name: "", url: "https://x.example" });
    expect(bad.status).toBe(400);
    const worse = await request(t.app)
      .post("/api/xenlink")
      .set(as(token))
      .send({ name: { $ne: 1 }, url: "u" });
    expect(worse.status).toBe(400);
    const ok = await request(t.app).post("/api/xenlink").set(as(token)).send({ name: "Docs", url: "example.com" });
    expect(ok.status).toBe(200);
  });

  it("redeeming a shop item needs a string itemId", async () => {
    const bad = await request(t.app)
      .post("/api/points/redeemItem")
      .set(as(token))
      .send({ itemId: { $gt: "" } });
    expect(bad.status).toBe(400);
    const missing = await request(t.app).post("/api/points/redeemItem").set(as(token)).send({});
    expect(missing.status).toBe(400);
  });

  it("add-password and pinned-apps check their payloads", async () => {
    const short = await request(t.app).post("/api/user/add-password").set(as(token)).send({ password: "abc" });
    expect(short.status).toBe(400);
    const wrongType = await request(t.app).put("/api/user/pinned-apps").set(as(token)).send({ pinnedApps: "xensplit" });
    expect(wrongType.status).toBe(400);
    const ok = await request(t.app)
      .put("/api/user/pinned-apps")
      .set(as(token))
      .send({ pinnedApps: ["xensplit"] });
    expect(ok.status).toBe(200);
  });

  it("a recipe needs a title, but a normal recipe still saves", async () => {
    const bad = await request(t.app).post("/api/recipaint").set(as(token)).send({ description: "no title" });
    expect(bad.status).toBe(400);
    const ok = await request(t.app)
      .post("/api/recipaint")
      .set(as(token))
      .send({
        title: "Skull",
        description: "",
        showcase: [],
        steps: [{ index: 0, title: "Base", description: "", paints: [] }],
        isPublic: false,
      });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it("XenBox upload initiation needs sane numbers", async () => {
    const bad = await request(t.app)
      .post("/api/xenbox/initiate")
      .set(as(token))
      .send({ filename: "a.bin", totalChunks: 0, fileSize: 10 });
    expect(bad.status).toBe(400);
    const strings = await request(t.app)
      .post("/api/xenbox/initiate")
      .set(as(token))
      .send({ filename: "a.bin", totalChunks: "2", fileSize: 10 });
    expect(strings.status).toBe(400);
  });

  it("admin user updates take roles as strings and quota as a number (fractions are fine)", async () => {
    const target = await createUser();
    const url = `/api/admin/users/${target.user._id}`;
    const bad = await request(t.app).put(url).set(as(adminToken)).send({ roles: "admin" });
    expect(bad.status).toBe(400);
    const negative = await request(t.app).put(url).set(as(adminToken)).send({ xenboxQuota: -5 });
    expect(negative.status).toBe(400);
    const ok = await request(t.app).put(url).set(as(adminToken)).send({ xenboxQuota: 322122547.2 });
    expect(ok.status).toBe(200);
  });
});

describe("query strings and public tokens", () => {
  it("blog pagination must be a sensible number", async () => {
    expect((await request(t.app).get("/api/blog?page=0")).status).toBe(400);
    expect((await request(t.app).get("/api/blog?limit=100000")).status).toBe(400);
    expect((await request(t.app).get("/api/blog?page=2&limit=5")).status).toBe(200);
  });

  it("a malformed XenBox share token is refused before any lookup", async () => {
    const res = await request(t.app).get("/api/xenbox/info/%24ne");
    expect(res.status).toBe(400);
  });
});
