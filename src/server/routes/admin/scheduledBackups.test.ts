import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { memoryStores } from "../../storage/index.js";
import { startTestApp, type TestApp } from "../../testing/testApp";

// The private bucket is the in-memory one (storage/memoryStore.ts): objects by name.
const bucket = {
  get objects() {
    return memoryStores().privateStore.objects;
  },
};
const putObject = (name: string, data: Buffer, created = new Date().toISOString()) =>
  bucket.objects.set(name, { body: data, contentType: "application/gzip", lastModified: new Date(created) });

let t: TestApp;
let backups: typeof import("../../utils/storageBackups.js");

beforeAll(async () => {
  t = await startTestApp([]);
  backups = await import("../../utils/storageBackups.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  bucket.objects.clear();
  backups.resetJobsForTests();
});

const db = () => mongoose.connection.db!;
const put = (name: string, created: string) => putObject(name, Buffer.from("x"), created);
const names = () => [...bucket.objects.keys()].sort();
const HOUR = 3_600_000;

describe("the backup schedule setting", () => {
  it("is off unless BACKUP_SCHEDULE_HOURS is a positive number", () => {
    expect(backups.scheduleFromEnv({})).toBeNull();
    expect(backups.scheduleFromEnv({ BACKUP_SCHEDULE_HOURS: "0" })).toBeNull();
    expect(backups.scheduleFromEnv({ BACKUP_SCHEDULE_HOURS: "abc" })).toBeNull();
    expect(backups.scheduleFromEnv({ BACKUP_SCHEDULE_HOURS: "24" })).toEqual({ everyHours: 24, keep: 14 });
    expect(backups.scheduleFromEnv({ BACKUP_SCHEDULE_HOURS: "6", BACKUP_KEEP: "3" })).toEqual({
      everyHours: 6,
      keep: 3,
    });
    expect(backups.scheduleFromEnv({ BACKUP_SCHEDULE_HOURS: "6", BACKUP_KEEP: "0" })?.keep).toBe(14);
  });
});

describe("a scheduled backup", () => {
  it("writes the first one, a scheduled-named object that the backup list recognises", async () => {
    expect(await backups.runScheduledBackup(db(), { everyHours: 24, keep: 3 })).toBe("backed-up");
    expect(names()).toHaveLength(1);
    expect(names()[0]).toMatch(/^db-backups\/scheduled-.*\.ndjson\.gz$/);
    expect(backups.isBackupName(names()[0])).toBe(true);
    expect((await backups.listBackups())[0].kind).toBe("scheduled");
  });

  it("does nothing while the newest scheduled backup is newer than the interval", async () => {
    const now = Date.now();
    put("db-backups/scheduled-2026-01-01T00-00-00-000Z.ndjson.gz", new Date(now - 5 * HOUR).toISOString());
    expect(await backups.runScheduledBackup(db(), { everyHours: 24, keep: 3 }, now)).toBe("skipped-recent");
    expect(names()).toHaveLength(1);
  });

  it("writes another once the interval has passed, and a manual backup doesn't count as a scheduled one", async () => {
    const now = Date.now();
    put("db-backups/xendelta-hub-backup-2026-01-01T00-00-00-000Z.ndjson.gz", new Date(now - HOUR).toISOString());
    put("db-backups/scheduled-2026-01-01T00-00-00-000Z.ndjson.gz", new Date(now - 25 * HOUR).toISOString());
    expect(await backups.runScheduledBackup(db(), { everyHours: 24, keep: 5 }, now)).toBe("backed-up");
    expect(names().filter((n) => n.includes("scheduled-"))).toHaveLength(2);
  });

  it("keeps only the newest N scheduled backups, and never deletes manual or pre-restore ones", async () => {
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      put(
        `db-backups/scheduled-2026-01-0${i + 1}T00-00-00-000Z.ndjson.gz`,
        new Date(now - (60 - i) * HOUR).toISOString(),
      );
    }
    put("db-backups/xendelta-hub-backup-2025-12-01T00-00-00-000Z.ndjson.gz", new Date(now - 900 * HOUR).toISOString());
    put("db-backups/pre-restore-2025-12-02T00-00-00-000Z.ndjson.gz", new Date(now - 800 * HOUR).toISOString());
    expect(await backups.runScheduledBackup(db(), { everyHours: 24, keep: 2 }, now)).toBe("backed-up");
    const scheduled = names().filter((n) => n.includes("scheduled-"));
    expect(scheduled).toHaveLength(2); // the new one and the newest old one
    expect(scheduled).toContain("db-backups/scheduled-2026-01-04T00-00-00-000Z.ndjson.gz");
    expect(names().some((n) => n.includes("xendelta-hub-backup-"))).toBe(true);
    expect(names().some((n) => n.includes("pre-restore-"))).toBe(true);
  });

  it("skips while a backup or restore is already running", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    backups.startJob(
      "backup",
      async () => (await hold, {}),
      async () => undefined,
    );
    expect(await backups.runScheduledBackup(db(), { everyHours: 24, keep: 3 })).toBe("skipped-running");
    release();
  });
});
