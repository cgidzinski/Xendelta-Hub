import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { Readable, Writable } from "stream";
import { startTestApp, type TestApp } from "../../testing/testApp";

// An in-memory stand-in for the private bucket: objects by name, with the few calls the backup code makes.
const bucket = vi.hoisted(() => ({ objects: new Map<string, { data: Buffer; created: string }>() }));
vi.mock("../../config/gcs", () => {
  const file = (name: string) => ({
    name,
    exists: async () => [bucket.objects.has(name)],
    delete: async () => void bucket.objects.delete(name),
    getSignedUrl: async () => [`https://signed.example/${name}`],
    createWriteStream: () => {
      const chunks: Buffer[] = [];
      return new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
        final(cb) {
          bucket.objects.set(name, { data: Buffer.concat(chunks), created: new Date().toISOString() });
          cb();
        },
      });
    },
    createReadStream: () => Readable.from([bucket.objects.get(name)!.data]),
  });
  const privateBucket = {
    file,
    getFiles: async ({ prefix }: { prefix: string }) => [
      [...bucket.objects]
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, o]) => ({ name, metadata: { size: String(o.data.length), timeCreated: o.created } })),
    ],
  };
  return { privateBucket, publicBucket: privateBucket };
});

let t: TestApp;
let backups: typeof import("../../utils/gcsBackups.js");

beforeAll(async () => {
  t = await startTestApp([]);
  backups = await import("../../utils/gcsBackups.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  bucket.objects.clear();
  backups.resetJobsForTests();
});

const db = () => mongoose.connection.db!;
const put = (name: string, created: string) => bucket.objects.set(name, { data: Buffer.from("x"), created });
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
