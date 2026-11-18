import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "../testing/testApp";
import { memoryStores } from "../storage";

// Loaded after the test app starts, so the environment it sets is in place before the billing code is imported.
let t: TestApp;
let FileRecord: typeof import("../models/fileRecord").FileRecord;
let MeterRun: typeof import("../models/meterRun").MeterRun;
let storageUsedBy: typeof import("../utils/fileRecords").storageUsedBy;
let userAccount: typeof import("./ledger").userAccount;
let communityAccount: typeof import("./ledger").communityAccount;
let usageFor: typeof import("./usage").usageFor;
let recordUsage: typeof import("./usage").recordUsage;
let assertCanStore: typeof import("./storageMeter").assertCanStore;
let runStorageMeter: typeof import("./storageMeter").runStorageMeter;
beforeAll(async () => {
  t = await startTestApp([]);
  ({ FileRecord } = await import("../models/fileRecord.js"));
  ({ MeterRun } = await import("../models/meterRun.js"));
  ({ storageUsedBy } = await import("../utils/fileRecords.js"));
  ({ userAccount, communityAccount } = await import("./ledger.js"));
  ({ usageFor, recordUsage } = await import("./usage.js"));
  ({ assertCanStore, runStorageMeter } = await import("./storageMeter.js"));
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
afterEach(async () => {
  await Promise.all([MeterRun.deleteMany({}), FileRecord.deleteMany({})]);
});

const GB = 1_000_000_000;
const file = (
  key: string,
  size: number,
  payer: { type: string; id?: string },
  createdAt = new Date("2026-11-01T00:00:00Z"),
) =>
  FileRecord.create({
    bucket: "private",
    key,
    size,
    payer,
    space: { app: "xendrive" },
    createdAt,
    thumbKey: `thumbs/${key}.webp`, // a thumbnail is a house cost: its size is never counted
  });

describe("the storage meter", () => {
  it("adds each payer's stored bytes as a day of byte-days, and records the house's separately", async () => {
    const [u, c] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    await file("a", 3 * GB, { type: "user", id: String(u) });
    await file("b", 1 * GB, { type: "user", id: String(u) });
    await file("c", 2 * GB, { type: "community", id: String(c) });
    await file("d", 9 * GB, { type: "house" });

    const done = await runStorageMeter(new Date("2026-11-15T10:00:00Z"));
    expect(done).toEqual(["2026-11-15"]);
    expect(await usageFor(userAccount(u), "2026-11")).toEqual([{ center: "storage", units: 4 * GB }]);
    expect(await usageFor(communityAccount(c), "2026-11")).toEqual([{ center: "storage", units: 2 * GB }]);
    // The house's own file is recorded (for the admin report) but nobody is billed for it.
    expect(await usageFor({ type: "house" }, "2026-11")).toEqual([{ center: "public_assets", units: 9 * GB }]);
    // It matches what the payer is paying for.
    expect(await storageUsedBy({ type: "user", id: String(u) })).toEqual({ files: 2, bytes: 4 * GB });
  });

  it("records the database backups on the house account", async () => {
    memoryStores().privateStore.objects.set("db-backups/a.ndjson.gz", {
      body: Buffer.alloc(1000),
      contentType: "application/gzip",
      lastModified: new Date("2026-11-01T00:00:00Z"),
    });
    await runStorageMeter(new Date("2026-11-15T10:00:00Z"));
    const lines = await usageFor({ type: "house" }, "2026-11");
    expect(lines).toContainEqual({ center: "backups", units: 1000 });
    memoryStores().privateStore.objects.delete("db-backups/a.ndjson.gz");
  });

  it("meters a day once, and catches up the days a stopped server missed", async () => {
    const u = new mongoose.Types.ObjectId();
    await file("a", GB, { type: "user", id: String(u) });

    expect(await runStorageMeter(new Date("2026-11-10T08:00:00Z"))).toEqual(["2026-11-10"]);
    expect(await runStorageMeter(new Date("2026-11-10T20:00:00Z"))).toEqual([]); // the same day again: nothing
    expect(await runStorageMeter(new Date("2026-11-13T01:00:00Z"))).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(await usageFor(userAccount(u), "2026-11")).toEqual([{ center: "storage", units: 4 * GB }]);
  });

  it("only counts a missed day's files that existed by then", async () => {
    const u = new mongoose.Types.ObjectId();
    await file("old", GB, { type: "user", id: String(u) });
    await runStorageMeter(new Date("2026-11-10T08:00:00Z"));
    await file("new", GB, { type: "user", id: String(u) }, new Date("2026-11-12T12:00:00Z"));
    await runStorageMeter(new Date("2026-11-13T01:00:00Z")); // 11th: old only, 12th and 13th: both
    expect(await usageFor(userAccount(u), "2026-11")).toEqual([{ center: "storage", units: (1 + 1 + 2 + 2) * GB }]);
  });
});

describe("assertCanStore", () => {
  it("refuses a payer who has used the free allowance, and lets anyone else store", async () => {
    const u = new mongoose.Types.ObjectId();
    await expect(assertCanStore(String(u))).resolves.toBeUndefined();
    await recordUsage(userAccount(u), "storage", 1_000 * GB * 30); // ~ 18,750 gems this month, far past the allowance
    await expect(assertCanStore(String(u))).rejects.toMatchObject({ status: 402 });
    await expect(assertCanStore(String(new mongoose.Types.ObjectId()))).resolves.toBeUndefined();
  });
});
