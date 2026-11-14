import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// The Billing view's data: your own bill, and a community's for its members only.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./billing.js"), () => import("./communities/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("billing overview", () => {
  it("shows your month so far, everything free, nothing charged", async () => {
    const { recordUsage } = await import("../billing/usage.js");
    const { userAccount } = await import("../billing/ledger.js");
    const { PERSON_FREE_TIER_GEMS } = await import("@shared/billing");
    const me = await createUser({ gems: 42 });
    await recordUsage(userAccount(me.user._id), "storage", 1234);

    const res = await request(t.app).get("/api/billing/me").set(as(me.token));
    expect(res.status).toBe(200);
    const o = res.body.data;
    expect(o).toMatchObject({
      account: { type: "user", id: String(me.user._id) },
      enforced: false,
      everythingFree: true,
      balance: 42,
      unpaid: 0,
      projectedDue: 0,
      monthsCovered: null,
      statements: [],
    });
    expect(o.current).toMatchObject({ amountDue: 0, freeTierGems: PERSON_FREE_TIER_GEMS });
    expect(o.current.lines.map((l: any) => l.center)).toEqual(["storage"]);
    // Only what an account pays for is listed, never the house's costs.
    expect(o.centers.map((c: any) => c.id)).toEqual(["storage", "downloads", "calls", "recipe_scans"]);
    expect(o.donationsOpen).toBeUndefined();
  });

  it("shows a community's bill to its members and nobody else", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const made = await request(t.app).post("/api/communities").set(as(owner.token)).send({ name: "Crew" });
    const id = made.body.data.community._id;

    const res = await request(t.app).get(`/api/communities/${id}/billing`).set(as(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ account: { type: "community", id }, balance: 0, donationsOpen: false });
    expect((await request(t.app).get(`/api/communities/${id}/billing`).set(as(stranger.token))).status).toBe(404);
    expect(
      (await request(t.app).get(`/api/communities/${new mongoose.Types.ObjectId()}/billing`).set(as(owner.token)))
        .status,
    ).toBe(404);
  });

  it("needs you to be signed in", async () => {
    expect((await request(t.app).get("/api/billing/me")).status).toBe(401);
  });
});
