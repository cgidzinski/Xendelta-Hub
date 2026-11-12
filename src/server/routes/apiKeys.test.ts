import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { API_KEY_APPS, appForPath, checkApiKeyAccess } from "@shared/apiKeys";

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp([
    () => import("./apiKeys.js"),
    () => import("./xenlink.js"),
    () => import("./users.js"),
    () => import("./shop.js"),
  ]);
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function makeKey(token: string, body: Record<string, unknown> = { name: "Home Assistant" }) {
  const res = await request(t.app).post("/api/user/api-keys").set(bearer(token)).send(body);
  expect(res.status).toBe(200);
  return res.body.data as { key: string; apiKey: { _id: string } };
}

describe("api keys", () => {
  it("stores only a hash and never lists the key", async () => {
    const { token } = await createUser();
    const { key, apiKey } = await makeKey(token);
    expect(key.startsWith("xd_")).toBe(true);

    const stored = await mongoose.model("ApiKey").findById(apiKey._id).lean<any>();
    expect(stored.hash).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain(key);

    const list = await request(t.app).get("/api/user/api-keys").set(bearer(token));
    expect(list.body.data.apiKeys).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(key);
    expect(JSON.stringify(list.body)).not.toContain(stored.hash);
  });

  it("works on an app route, as the owner, and refreshes lastUsedAt", async () => {
    const owner = await createUser();
    const { key } = await makeKey(owner.token);
    await request(t.app).post("/api/xenlink").set(bearer(key)).send({ name: "Docs", url: "https://example.com/a" });

    const viaKey = await request(t.app).get("/api/xenlink/list").set(bearer(key));
    expect(viaKey.status).toBe(200);
    expect(viaKey.body.data.links).toHaveLength(1);

    // A different user's key sees none of it.
    const other = await createUser();
    const otherKey = await makeKey(other.token);
    const otherList = await request(t.app).get("/api/xenlink/list").set(bearer(otherKey.key));
    expect(otherList.body.data.links).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 50));
    const listed = await request(t.app).get("/api/user/api-keys").set(bearer(owner.token));
    expect(listed.body.data.apiKeys[0].lastUsedAt).toBeTruthy();
  });

  it("can ask who it is, but can't reach keys, shop or other non-app routes", async () => {
    const { token } = await createUser();
    const { key } = await makeKey(token);
    expect((await request(t.app).get("/api/user/profile").set(bearer(key))).status).toBe(200);
    for (const path of ["/api/user/api-keys", "/api/shop", "/api/user/inventory"]) {
      const res = await request(t.app).get(path).set(bearer(key));
      expect(res.status, path).toBe(403);
    }
    const mint = await request(t.app).post("/api/user/api-keys").set(bearer(key)).send({ name: "x" });
    expect(mint.status).toBe(403);
  });

  it("an app-limited key can't use other apps", async () => {
    const { token } = await createUser();
    const { key } = await makeKey(token, { name: "Notes only", apps: ["xennote"] });
    expect((await request(t.app).get("/api/xenlink/list").set(bearer(key))).status).toBe(403);
  });

  it("a read-only key can read but not write", async () => {
    const { token } = await createUser();
    const { key } = await makeKey(token, { name: "RO", readOnly: true });
    expect((await request(t.app).get("/api/xenlink/list").set(bearer(key))).status).toBe(200);
    const post = await request(t.app).post("/api/xenlink").set(bearer(key)).send({ name: "A", url: "https://e.com" });
    expect(post.status).toBe(403);
  });

  it("refuses revoked, expired and unknown keys with 401", async () => {
    const { token } = await createUser();
    const revoked = await makeKey(token);
    const del = await request(t.app).delete(`/api/user/api-keys/${revoked.apiKey._id}`).set(bearer(token));
    expect(del.status).toBe(200);
    expect((await request(t.app).get("/api/xenlink/list").set(bearer(revoked.key))).status).toBe(401);

    const expired = await makeKey(token);
    await mongoose.model("ApiKey").updateOne({ _id: expired.apiKey._id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(t.app).get("/api/xenlink/list").set(bearer(expired.key))).status).toBe(401);

    expect((await request(t.app).get("/api/xenlink/list").set(bearer("xd_nonsense"))).status).toBe(401);
  });

  it("only the owner can revoke a key, and session JWTs still work", async () => {
    const a = await createUser();
    const b = await createUser();
    const { apiKey } = await makeKey(a.token);
    const res = await request(t.app).delete(`/api/user/api-keys/${apiKey._id}`).set(bearer(b.token));
    expect(res.status).toBe(404);
    expect((await request(t.app).get("/api/xenlink/list").set(bearer(a.token))).status).toBe(200);
  });

  it("validates input", async () => {
    const { token } = await createUser();
    const bad = await request(t.app)
      .post("/api/user/api-keys")
      .set(bearer(token))
      .send({ name: "x", apps: ["nope"] });
    expect(bad.status).toBe(400);
  });
});

describe("api key allowlist", () => {
  it("matches path prefixes on a segment boundary", () => {
    expect(appForPath("/api/xennote/notebooks")).toBe("xennote");
    expect(appForPath("/api/xennote")).toBe("xennote");
    expect(appForPath("/api/xennotes")).toBeNull();
    expect(appForPath("/api/paints/1")).toBe("recipaint");
    expect(appForPath("/api/admin/users")).toBeNull();
  });

  it("applies the same rules for a mounted-middleware path", () => {
    expect(checkApiKeyAccess({ apps: [], readOnly: false }, "post", "/api/xendrive/folders")).toEqual({ ok: true });
  });

  it("covers every app in the client registry", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/client/constants/apps.ts", "utf8");
    const keys = [...src.matchAll(/key: "([a-z]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(Object.keys(API_KEY_APPS), k).toContain(k);
  });
});
