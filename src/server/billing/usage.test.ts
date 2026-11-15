import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "../testing/testApp";

let t: TestApp;
let usage: typeof import("./usage");
let ledger: typeof import("./ledger");
beforeAll(async () => {
  t = await startTestApp([]);
  usage = await import("./usage.js");
  ledger = await import("./ledger.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const someone = () => ledger.userAccount(new mongoose.Types.ObjectId());

describe("recordUsage", () => {
  it("adds up usage per center within a month", async () => {
    const account = someone();
    await usage.recordUsage(account, "calls", 100);
    await usage.recordUsage(account, "calls", 50);
    await usage.recordUsage(account, "storage", 7);
    const lines = await usage.usageFor(account);
    expect(lines.sort((a, b) => a.center.localeCompare(b.center))).toEqual([
      { center: "calls", units: 150 },
      { center: "storage", units: 7 },
    ]);
  });

  it("keeps months apart", async () => {
    const account = someone();
    await usage.recordUsage(account, "calls", 10, new Date(Date.UTC(2026, 9, 31, 23)));
    await usage.recordUsage(account, "calls", 20, new Date(Date.UTC(2026, 10, 1, 1)));
    expect(await usage.usageFor(account, "2026-10")).toEqual([{ center: "calls", units: 10 }]);
    expect(await usage.usageFor(account, "2026-11")).toEqual([{ center: "calls", units: 20 }]);
  });

  it("keeps people, communities and the house apart", async () => {
    const id = new mongoose.Types.ObjectId();
    await usage.recordUsage(ledger.userAccount(id), "storage", 1);
    await usage.recordUsage(ledger.communityAccount(id), "storage", 2);
    await usage.recordUsage(ledger.HOUSE, "backups", 3);
    expect(await usage.usageFor(ledger.userAccount(id))).toEqual([{ center: "storage", units: 1 }]);
    expect(await usage.usageFor(ledger.communityAccount(id))).toEqual([{ center: "storage", units: 2 }]);
    expect((await usage.usageFor(ledger.HOUSE)).find((l) => l.center === "backups")?.units).toBeGreaterThanOrEqual(3);
  });

  it("ignores unknown centers and nothing-amounts without throwing", async () => {
    const account = someone();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await usage.recordUsage(account, "nope" as any, 5);
    await usage.recordUsage(account, "calls", 0);
    await usage.recordUsage(account, "calls", Number.NaN);
    expect(await usage.usageFor(account)).toEqual([]);
    log.mockRestore();
  });

  it("is enforced unless switched off with BILLING_ENFORCED=false", () => {
    const saved = process.env.BILLING_ENFORCED;
    delete process.env.BILLING_ENFORCED;
    expect(usage.billingEnforced()).toBe(true);
    process.env.BILLING_ENFORCED = "false";
    expect(usage.billingEnforced()).toBe(false);
    if (saved === undefined) delete process.env.BILLING_ENFORCED;
    else process.env.BILLING_ENFORCED = saved;
  });
});
