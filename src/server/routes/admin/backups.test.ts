import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Readable, Writable } from "stream";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

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
let adminUser: Awaited<ReturnType<typeof createUser>>;
let gcsBackups: typeof import("../../utils/gcsBackups.js");

beforeAll(async () => {
  t = await startTestApp([
    async () => {
      const { restoreMaintenance } = await import("../../middleware/restoreMaintenance.js");
      return (app: any) => app.use(restoreMaintenance);
    },
    () => import("./index.js"),
  ]);
  gcsBackups = await import("../../utils/gcsBackups.js");
  adminUser = await createUser({ roles: ["admin"], username: "boss" });
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(async () => {
  bucket.objects.clear();
  gcsBackups.resetJobsForTests();
  await mongoose.model("AdminAudit").deleteMany({});
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (url: string) => request(t.app).get(`/api/admin${url}`).set(as(adminUser.token));
const send = (method: "post" | "delete", url: string, body?: object) =>
  request(t.app)[method](`/api/admin${url}`).set(as(adminUser.token)).send(body);
const audit = async (filter: object = {}) =>
  mongoose.model("AdminAudit").find(filter).sort({ createdAt: 1 }).lean<any[]>();

/** Poll the job until it stops running; a 401/503 during a restore counts as still running. */
async function finished() {
  for (let i = 0; i < 200; i++) {
    const res = await get("/backups/job");
    const job = res.body?.data?.job;
    if (res.status === 200 && job && job.status !== "running") return job;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("the job never finished");
}

describe("database backups", () => {
  it("is closed to anyone who isn't an admin", async () => {
    const plain = await createUser();
    const name = "db-backups/xendelta-hub-backup-2026-01-01T00-00-00-000Z.ndjson.gz";
    expect((await request(t.app).get("/api/admin/backups").set(as(plain.token))).status).toBe(403);
    expect((await request(t.app).post("/api/admin/backups").set(as(plain.token))).status).toBe(403);
    expect(
      (await request(t.app).post("/api/admin/backups/restore").set(as(plain.token)).send({ name, confirm: "RESTORE" }))
        .status,
    ).toBe(403);
    expect((await request(t.app).delete("/api/admin/backups").set(as(plain.token)).send({ name })).status).toBe(403);
    expect((await request(t.app).get("/api/admin/backups")).status).toBe(401);
  });

  it("backs the database up to the bucket, lists it, and logs it", async () => {
    const started = await send("post", "/backups");
    expect(started.status).toBe(202);
    expect(started.body.data.job).toMatchObject({ kind: "backup", status: "running" });

    const job = await finished();
    expect(job.status).toBe("done");
    expect(job.name).toMatch(/^db-backups\/xendelta-hub-backup-.*\.ndjson\.gz$/);

    const list = await get("/backups");
    expect(list.body.data.backups).toHaveLength(1);
    expect(list.body.data.backups[0]).toMatchObject({ name: job.name, kind: "backup" });
    expect(list.body.data.backups[0].size).toBeGreaterThan(0);

    const rows = await audit({ action: "backup_create" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "System", target: { type: "database" } });
  });

  it("runs one job at a time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    gcsBackups.startJob(
      "backup",
      async () => {
        await gate;
        return {};
      },
      async () => undefined,
    );
    const second = await send("post", "/backups");
    expect(second.status).toBe(409);
    release();
    await finished();
    expect((await send("post", "/backups")).status).toBe(202);
    await finished();
  });

  it("restores a backup, takes a safety copy first, and logs the restore after it ends", async () => {
    const Marker = mongoose.connection.collection("backup_markers");
    await Marker.insertOne({ label: "before the backup" });

    await send("post", "/backups");
    const made = await finished();

    // Change the data after the backup, then restore.
    await Marker.deleteMany({});
    await Marker.insertOne({ label: "added later" });

    const started = await send("post", "/backups/restore", { name: made.name, confirm: "RESTORE" });
    expect(started.status).toBe(202);
    const done = await finished();
    expect(done).toMatchObject({ kind: "restore", status: "done", name: made.name });
    expect(done.snapshot).toMatch(/^db-backups\/pre-restore-/);
    expect(done.summary.errors).toEqual([]);

    expect((await Marker.find({}).toArray()).map((d) => d.label)).toEqual(["before the backup"]);
    // The restore replaced the audit log, then wrote its own row.
    const rows = await audit({ action: "backup_restore" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "Danger" });

    const kinds = (await get("/backups")).body.data.backups.map((b: { kind: string }) => b.kind).sort();
    expect(kinds).toEqual(["backup", "pre-restore"]);
  });

  it("needs the word RESTORE and one of our own backup names", async () => {
    const name = "db-backups/xendelta-hub-backup-2026-01-01T00-00-00-000Z.ndjson.gz";
    bucket.objects.set(name, { data: Buffer.from("x"), created: new Date().toISOString() });

    expect((await send("post", "/backups/restore", { name })).status).toBe(400);
    expect((await send("post", "/backups/restore", { name, confirm: "restore" })).status).toBe(400);
    for (const bad of ["../secrets.gz", "db-backups/../x.ndjson.gz", "xendrive/someone/file.ndjson.gz", "other.gz"]) {
      expect((await send("post", "/backups/restore", { name: bad, confirm: "RESTORE" })).status, bad).toBe(400);
      expect((await send("delete", "/backups", { name: bad })).status, bad).toBe(400);
      expect((await get(`/backups/download?name=${encodeURIComponent(bad)}`)).status, bad).toBe(400);
    }
    // A well-formed name that isn't in the bucket.
    const missing = "db-backups/xendelta-hub-backup-2030-01-01T00-00-00-000Z.ndjson.gz";
    expect((await send("post", "/backups/restore", { name: missing, confirm: "RESTORE" })).status).toBe(404);
  });

  it("deletes a backup and gives a download link", async () => {
    await send("post", "/backups");
    const { name } = await finished();

    const link = await get(`/backups/download?name=${encodeURIComponent(name)}`);
    expect(link.body.data.url).toBe(`https://signed.example/${name}`);

    expect((await send("delete", "/backups", { name })).body.status).toBe(true);
    expect((await get("/backups")).body.data.backups).toHaveLength(0);
    expect((await send("delete", "/backups", { name })).status).toBe(404);
    expect(await audit({ action: "backup_delete" })).toHaveLength(1);
  });

  it("refuses a bad backup file before touching the database", async () => {
    const Marker = mongoose.connection.collection("backup_markers");
    await Marker.deleteMany({});
    await Marker.insertOne({ label: "still here" });
    const bad = (n: string) => `db-backups/xendelta-hub-backup-2026-01-0${n}T00-00-00-000Z.ndjson.gz`;
    const { gzipSync } = await import("zlib");
    const cases: Record<string, Buffer> = {
      [bad("1")]: Buffer.from("this is not gzip"),
      [bad("2")]: gzipSync("just some text, no backup header\n"),
      [bad("3")]: gzipSync('#META\t{"collections":[]}\n#COLLECTION\tx\n' + "{}\n".repeat(5000)).subarray(0, 40),
    };
    for (const [name, data] of Object.entries(cases)) {
      bucket.objects.set(name, { data, created: new Date().toISOString() });
      expect((await send("post", "/backups/restore", { name, confirm: "RESTORE" })).status).toBe(202);
      const job = await finished();
      expect(job, name).toMatchObject({ kind: "restore", status: "error" });
      expect(job.error).toBeTruthy();
    }
    // Nothing was wiped and no safety copy was needed.
    expect((await Marker.find({}).toArray()).map((d) => d.label)).toEqual(["still here"]);
    expect((await get("/backups")).body.data.backups.some((b: { kind: string }) => b.kind === "pre-restore")).toBe(
      false,
    );
    expect((await audit({ action: "backup_restore" })).map((r) => r.detail).every((d) => d.includes("failed"))).toBe(
      true,
    );
  });

  it("answers 503 to API requests while a restore runs, and keeps the status open", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    gcsBackups.startJob(
      "restore",
      async () => {
        await gate;
        return {};
      },
      async () => undefined,
    );

    const blocked = await request(t.app).get("/api/admin/backups").set(as(adminUser.token));
    expect(blocked.status).toBe(503);
    expect(blocked.body.code).toBe("MAINTENANCE");
    // Signed out and signed in alike: no 401, which would sign people out.
    expect((await request(t.app).get("/api/users/profile")).status).toBe(503);

    const status = await request(t.app).get("/api/admin/backups/job");
    expect(status.status).toBe(200);
    expect(status.body.data.job).toMatchObject({ kind: "restore", status: "running" });
    expect(status.body.data.job.name).toBeUndefined();

    release();
    await finished();
    expect((await get("/backups")).status).toBe(200);
  });
});
