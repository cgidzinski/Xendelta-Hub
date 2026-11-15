import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import * as billing from "@shared/billing";

// Month-end settlement and canSpend. Every real center is free, so these tests switch one on for a while.

let t: TestApp;
let settlement: typeof import("./settlement");
let usage: typeof import("./usage");
let ledger: typeof import("./ledger");
beforeAll(async () => {
  t = await startTestApp([]);
  settlement = await import("./settlement.js");
  usage = await import("./usage.js");
  ledger = await import("./ledger.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

/** Make downloads cost `gemsPerGb` (margin included) for the length of a test. */
function meterDownloads(gemsPerGb: number) {
  const center = billing.COST_CENTERS.find((c) => c.id === "calls") as any;
  const before = { costRate: center.costRate, status: center.status };
  center.costRate = gemsPerGb / billing.BILLING_MARGIN;
  center.status = "metered";
  return () => Object.assign(center, before);
}

const GB = 1_000_000_000;
const F = billing.PERSON_FREE_TIER_GEMS;
const CF = billing.COMMUNITY_FREE_TIER_GEMS;
/** Bytes that cost `gems` gems at the 100 gems per GB the tests set. */
const bytesFor = (gems: number) => (gems / 100) * GB;
const Statement = () => mongoose.model("BillingStatement") as any;
const gemsOf = async (id: unknown) => ((await mongoose.model("User").findById(id, "gems").lean()) as any).gems;
const october = new Date(Date.UTC(2026, 9, 15));
const november = new Date(Date.UTC(2026, 10, 5));

describe("settleMonth", () => {
  it("writes one statement per account, once, and owes nothing while everything is free", async () => {
    const { user } = await createUser({ gems: 10 });
    const account = ledger.userAccount(user._id);
    await usage.recordUsage(account, "calls", 5 * GB, october);
    await settlement.settleMonth("2026-10");
    await settlement.settleMonth("2026-10");
    const rows = await Statement().find({ "account.id": user._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ month: "2026-10", amountDue: 0, status: "free" });
    expect(await gemsOf(user._id)).toBe(10);
  });

  it("pays from the balance, rounding the bill up once", async () => {
    const restore = meterDownloads(100);
    try {
      const { user } = await createUser({ gems: 1000 });
      // 0.01 gems beyond the free tier rounds up to 1 gem.
      await usage.recordUsage(ledger.userAccount(user._id), "calls", bytesFor(F + 0.01), october);
      await settlement.settleMonth("2026-10");
      const row = await Statement().findOne({ "account.id": user._id }).lean();
      expect(row).toMatchObject({ status: "paid", amountDue: 1, paid: 1, unpaid: 0 });
      expect(await gemsOf(user._id)).toBe(999);
      await settlement.settleMonth("2026-10");
      expect(await gemsOf(user._id)).toBe(999);
    } finally {
      restore();
    }
  });

  it("records an unpaid bill when the balance can't cover it, and takes nothing", async () => {
    const restore = meterDownloads(100);
    try {
      const { user } = await createUser({ gems: 50 });
      await usage.recordUsage(ledger.userAccount(user._id), "calls", bytesFor(F + 100), october); // 100 beyond the free tier
      await settlement.settleMonth("2026-10");
      const row = await Statement().findOne({ "account.id": user._id }).lean();
      expect(row).toMatchObject({ status: "unpaid", amountDue: 100, paid: 0, unpaid: 100 });
      expect(await gemsOf(user._id)).toBe(50);
    } finally {
      restore();
    }
  });

  it("bills a community's fund", async () => {
    const restore = meterDownloads(100);
    try {
      const Community = (await import("../models/community.js")).Community;
      const community = await Community.create({ name: "Club", members: [], fund: 1000 });
      await usage.recordUsage(ledger.communityAccount(community._id), "calls", bytesFor(CF + 300), october);
      await settlement.settleMonth("2026-10");
      expect((await Community.findById(community._id).lean())!.fund).toBe(700);
    } finally {
      restore();
    }
  });
});

describe("settleClosedMonths", () => {
  it("catches up a month that was missed, and leaves the current month open", async () => {
    const { user } = await createUser();
    const account = ledger.userAccount(user._id);
    await usage.recordUsage(account, "storage", 1, new Date(Date.UTC(2026, 7, 10))); // August
    await usage.recordUsage(account, "storage", 1, november);
    const settled = await settlement.settleClosedMonths(november);
    expect(settled).toContain("2026-08");
    const months = (await Statement().find({ "account.id": user._id }).lean()).map((s: any) => s.month);
    expect(months).toEqual(["2026-08"]);
    expect(await settlement.settleClosedMonths(november)).not.toContain("2026-08");
  });
});

describe("canSpend", () => {
  it("allows usage inside the free tier, then needs a balance that covers the month", async () => {
    const restore = meterDownloads(100);
    try {
      const { user } = await createUser();
      const account = ledger.userAccount(user._id);
      expect(await settlement.canSpend(account)).toBe(true);
      await usage.recordUsage(account, "calls", bytesFor(F + 50)); // 50 beyond the free tier
      expect(await settlement.canSpend(account)).toBe(false);
      await ledger.transfer({
        from: ledger.HOUSE,
        to: account,
        amount: 50,
        kind: "admin_adjustment",
        idempotencyKey: `t:${user._id}:50`,
      });
      expect(await settlement.canSpend(account)).toBe(false); // exactly covered leaves nothing to spend
      await ledger.transfer({
        from: ledger.HOUSE,
        to: account,
        amount: 1,
        kind: "admin_adjustment",
        idempotencyKey: `t:${user._id}:1`,
      });
      expect(await settlement.canSpend(account)).toBe(true);
      await expect(
        settlement.assertCanSpend(ledger.userAccount(new mongoose.Types.ObjectId())),
      ).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it("counts an unpaid bill from an earlier month", async () => {
    const { user } = await createUser({ gems: 20 });
    await Statement().create({
      account: { type: "user", id: user._id },
      month: "2026-01",
      margin: 1,
      usageGems: 0,
      freeTierGems: 0,
      freeTierUsed: 0,
      amountDue: 30,
      unpaid: 30,
      status: "unpaid",
    });
    expect(await settlement.canSpend(ledger.userAccount(user._id))).toBe(false);
    await expect(settlement.assertCanSpend(ledger.userAccount(user._id))).rejects.toMatchObject({ status: 402 });
  });
});

describe("warnNearFreeTier", () => {
  it("warns once per account and month at 80% of the free tier", async () => {
    const restore = meterDownloads(100);
    try {
      const notifications = await import("../utils/notificationUtils.js");
      const spy = vi.spyOn(notifications, "notify");
      const { user } = await createUser();
      await usage.recordUsage(ledger.userAccount(user._id), "calls", bytesFor(F * 0.9), november); // 90% of the free tier
      await settlement.warnNearFreeTier(november);
      await settlement.warnNearFreeTier(november);
      const mine = spy.mock.calls.filter(([id]) => String(id) === String(user._id));
      expect(mine).toHaveLength(1);
      expect(mine[0][1].message).toBe(`${F * 0.1} gems left this month.`);
    } finally {
      restore();
    }
  });
});
