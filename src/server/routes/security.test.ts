import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Regression tests for the cleanup's security fixes (#181). They run the real routes and
// models against an in-memory MongoDB.

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp([
    () => import("./auth.js"),
    () => import("./users.js"),
    () => import("./points.js"),
  ]);
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("password reset", () => {
  it("rejects a Mongo operator in place of the token (account takeover)", async () => {
    const { user } = await createUser();
    // Give the victim a live reset, as if they had asked for one.
    user.resetPassword = { token: "stored-hash", expires: new Date(Date.now() + 3_600_000) };
    await user.save();

    const res = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token: { $ne: null }, email: user.email, newPassword: "attacker-pass-1" });

    expect(res.status).toBe(400);
    const fresh: any = await mongoose.model("User").findById(user._id);
    expect(fresh.password).toBe("unused");
  });

  it("rejects operators in verify-reset-token and forgot-password too", async () => {
    const verify = await request(t.app)
      .post("/api/auth/verify-reset-token")
      .send({ token: { $ne: null }, email: "someone@example.com" });
    expect(verify.status).toBe(400);

    const forgot = await request(t.app).post("/api/auth/forgot-password").send({ email: { $ne: null } });
    expect(forgot.status).toBe(400);
  });

  it("stores only a hash of the token and accepts the emailed raw token", async () => {
    const { hashToken } = await import("../utils/tokens.js");
    const { user } = await createUser();
    const raw = "raw-token-from-the-email-link";
    user.resetPassword = { token: hashToken(raw), expires: new Date(Date.now() + 3_600_000) };
    await user.save();

    const bad = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token: "stored-hash-guess", email: user.email, newPassword: "new-password-1" });
    expect(bad.body.status).toBe(false);

    const ok = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token: raw, email: user.email, newPassword: "new-password-1" });
    expect(ok.body, JSON.stringify(ok.body) + " " + ok.status).toMatchObject({ status: true });

    const fresh: any = await mongoose.model("User").findById(user._id);
    expect(fresh.validPassword("new-password-1")).toBe(true);
    expect(fresh.resetPassword.token).toBeUndefined();
  });
});

describe("user directory", () => {
  it("does not expose emails or roles to ordinary users", async () => {
    const { token } = await createUser();
    await createUser({ roles: ["admin"] });

    const res = await request(t.app).get("/api/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThan(1);
    for (const u of res.body.data.users) {
      expect(u).not.toHaveProperty("email");
      expect(u).not.toHaveProperty("roles");
      expect(u).toHaveProperty("username");
    }
  });
});

describe("points shop", () => {
  it("cannot be overspent by simultaneous purchases", async () => {
    // Item "3" costs 5000. With exactly 5000 points only one of ten parallel requests may win.
    const { user, token } = await createUser({ points: 5000 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(t.app).post("/api/points/redeemItem").set("Authorization", `Bearer ${token}`).send({ itemId: "3" }),
      ),
    );

    const wins = results.filter((r) => r.body.status === true).length;
    expect(wins).toBe(1);

    const fresh: any = await mongoose.model("User").findById(user._id);
    expect(fresh.points).toBe(0);
    expect(fresh.inventory).toHaveLength(1);
  });

  it("refuses a purchase the balance cannot cover", async () => {
    const { user, token } = await createUser({ points: 100 });
    const res = await request(t.app).post("/api/points/redeemItem").set("Authorization", `Bearer ${token}`).send({ itemId: "3" });
    expect(res.body.status).toBe(false);
    expect(((await mongoose.model("User").findById(user._id)) as any).points).toBe(100);
  });
});
