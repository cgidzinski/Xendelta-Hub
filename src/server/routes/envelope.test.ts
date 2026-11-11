import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Every route answers with `status` (the app-wide envelope). Auth and users used to answer with
// `success` only. They send both for one release: installed PWAs still running the old client read
// `success`. Drop `success` (and this test) once nobody can be on the old client.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./auth.js"), () => import("./users.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("auth and users response envelope", () => {
  it("login answers with both status and success", async () => {
    const bad = await request(t.app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever-1" });
    expect(bad.body.status).toBe(false);
    expect(bad.body.success).toBe(false);
  });

  it("a successful call carries both too", async () => {
    const { token } = await createUser();
    const res = await request(t.app)
      .get("/api/user/auth-providers")
      .set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(true);
    expect(res.body.success).toBe(true);
  });
});
