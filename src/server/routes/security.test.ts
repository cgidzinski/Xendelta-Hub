import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Regression tests for the cleanup's security fixes (#181). They run the real routes and
// models against an in-memory MongoDB.

// Capture the emailed link instead of calling Resend.
const sentEmails: Array<{ email: string; resetUrl: string }> = [];
vi.mock("../utils/emailUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  sendPasswordResetEmail: vi.fn(async (args: { email: string; resetUrl: string }) => {
    sentEmails.push(args);
    return { success: true };
  }),
}));

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp([() => import("./auth.js"), () => import("./users.js"), () => import("./shop.js")]);
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

    const forgot = await request(t.app)
      .post("/api/auth/forgot-password")
      .send({ email: { $ne: null } });
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

describe("gem shop", () => {
  it("cannot be overspent by simultaneous purchases", async () => {
    // Item "3" costs 5000. With exactly 5000 gems only one of ten parallel requests may win.
    const { user, token } = await createUser({ gems: 5000 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(t.app).post("/api/shop/buy").set("Authorization", `Bearer ${token}`).send({ itemId: "3" }),
      ),
    );

    const wins = results.filter((r) => r.body.status === true).length;
    expect(wins).toBe(1);

    const fresh: any = await mongoose.model("User").findById(user._id);
    expect(fresh.gems).toBe(0);
    expect(fresh.inventory).toHaveLength(1);
  });

  it("refuses a purchase the balance cannot cover", async () => {
    const { user, token } = await createUser({ gems: 100 });
    const res = await request(t.app)
      .post("/api/shop/buy")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemId: "3" });
    expect(res.body.status).toBe(false);
    expect(((await mongoose.model("User").findById(user._id)) as any).gems).toBe(100);
  });
});

describe("password recovery link lifetime", () => {
  const rawTokenFrom = (resetUrl: string) => new URL(resetUrl).searchParams.get("token")!;

  it("is valid for one hour from the request", async () => {
    const { user } = await createUser();
    sentEmails.length = 0;
    const before = Date.now();
    await request(t.app).post("/api/auth/forgot-password").send({ email: user.email });

    const fresh: any = await mongoose.model("User").findById(user._id);
    const lifetime = fresh.resetPassword.expires.getTime() - before;
    expect(lifetime).toBeGreaterThan(59 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);
    expect(sentEmails).toHaveLength(1);
  });

  it("is rejected once the hour has passed", async () => {
    const { user } = await createUser();
    sentEmails.length = 0;
    await request(t.app).post("/api/auth/forgot-password").send({ email: user.email });
    const token = rawTokenFrom(sentEmails[0].resetUrl);

    // Same token, but pretend it was issued 61 minutes ago.
    await mongoose
      .model("User")
      .updateOne({ _id: user._id }, { "resetPassword.expires": new Date(Date.now() - 60_000) });

    const verify = await request(t.app).post("/api/auth/verify-reset-token").send({ token, email: user.email });
    expect(verify.body.status).toBe(false);
    const reset = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token, email: user.email, newPassword: "new-password-1" });
    expect(reset.body.status).toBe(false);
  });

  it("works once only", async () => {
    const { user } = await createUser();
    sentEmails.length = 0;
    await request(t.app).post("/api/auth/forgot-password").send({ email: user.email });
    const token = rawTokenFrom(sentEmails[0].resetUrl);

    const first = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token, email: user.email, newPassword: "new-password-1" });
    expect(first.body.status).toBe(true);
    const second = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token, email: user.email, newPassword: "another-pass-2" });
    expect(second.body.status).toBe(false);
  });

  it("a newer request invalidates the earlier link", async () => {
    const { user } = await createUser();
    sentEmails.length = 0;
    await request(t.app).post("/api/auth/forgot-password").send({ email: user.email });
    await request(t.app).post("/api/auth/forgot-password").send({ email: user.email });
    const [older, newer] = sentEmails.map((e) => rawTokenFrom(e.resetUrl));

    const stale = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token: older, email: user.email, newPassword: "new-password-1" });
    expect(stale.body.status).toBe(false);
    const current = await request(t.app)
      .post("/api/auth/reset-password")
      .send({ token: newer, email: user.email, newPassword: "new-password-1" });
    expect(current.body.status).toBe(true);
  });
});
