import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Giving gems to another person: the ledger moves them once, nobody is overdrawn, and nothing is created.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./billing.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const gemsOf = async (id: unknown) => (await mongoose.model("User").findById(id, "gems").lean<any>()).gems;
const give = (from: { token: string }, body: Record<string, unknown>) =>
  request(t.app)
    .post("/api/billing/gift")
    .set(as(from.token))
    .send({ requestId: crypto.randomUUID(), ...body });

describe("giving gems", () => {
  it("moves whole gems from one person to another and records a gift", async () => {
    const a = await createUser({ gems: 100 });
    const b = await createUser({ gems: 5 });

    const res = await give(a, { toUserId: String(b.user._id), gems: 30, note: "For lunch" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.balance).toBe(70);
    expect(await gemsOf(a.user._id)).toBe(70);
    expect(await gemsOf(b.user._id)).toBe(35);

    const tx = await mongoose.model("GemTransaction").findOne({ kind: "gift", "from.id": a.user._id }).lean<any>();
    expect(tx).toMatchObject({ amount: 30, status: "applied", meta: { note: "For lunch" } });
  });

  it("gives only once when the same request is sent twice", async () => {
    const a = await createUser({ gems: 50 });
    const b = await createUser({ gems: 0 });
    const body = { toUserId: String(b.user._id), gems: 10, requestId: "retry-request-1" };
    expect((await give(a, body)).status).toBe(200);
    expect((await give(a, body)).status).toBe(200);
    expect(await gemsOf(a.user._id)).toBe(40);
    expect(await gemsOf(b.user._id)).toBe(10);
  });

  it("refuses more gems than you have, and changes nothing", async () => {
    const a = await createUser({ gems: 5 });
    const b = await createUser({ gems: 0 });
    const res = await give(a, { toUserId: String(b.user._id), gems: 6 });
    expect(res.status).toBe(402);
    expect(await gemsOf(a.user._id)).toBe(5);
    expect(await gemsOf(b.user._id)).toBe(0);
  });

  it("refuses giving to yourself, to someone who doesn't exist, and odd amounts", async () => {
    const a = await createUser({ gems: 50 });
    expect((await give(a, { toUserId: String(a.user._id), gems: 5 })).status).toBe(400);
    expect((await give(a, { toUserId: String(new mongoose.Types.ObjectId()), gems: 5 })).status).toBe(404);
    const b = await createUser();
    for (const gems of [0, -3, 1.5]) {
      expect((await give(a, { toUserId: String(b.user._id), gems })).status).toBe(400);
    }
    expect((await give(a, { toUserId: String(b.user._id), gems: 5, note: "x".repeat(141) })).status).toBe(400);
    expect(await gemsOf(a.user._id)).toBe(50);
  });

  it("needs a signed-in caller", async () => {
    const b = await createUser();
    const res = await request(t.app)
      .post("/api/billing/gift")
      .send({ toUserId: String(b.user._id), gems: 1, requestId: "no-auth-request" });
    expect(res.status).toBe(401);
  });
});
