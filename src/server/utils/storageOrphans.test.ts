import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestApp, type TestApp } from "../testing/testApp";
import { memoryStores } from "../storage";
import { FileRecord } from "../models/fileRecord";

// The orphan finder: what no file record names is listed (and deleted only when asked); everything with a record,
// database backups and fresh uploads are kept; records whose file is missing are reported.

let t: TestApp;
let orphans: typeof import("./storageOrphans");
beforeAll(async () => {
  t = await startTestApp([]);
  orphans = await import("./storageOrphans.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  memoryStores().privateStore.clear();
  memoryStores().publicStore.clear();
});

const DAY = 24 * 60 * 60 * 1000;
const old = new Date(Date.now() - 3 * DAY);
const put = (which: "privateStore" | "publicStore", key: string, lastModified = old) =>
  memoryStores()[which].objects.set(key, { body: Buffer.alloc(10), contentType: "image/jpeg", lastModified });

const record = (bucket: "private" | "public", key: string, extra: object = {}) =>
  FileRecord.create({ bucket, key, payer: { type: "house" }, space: { app: "test" }, ...extra });

describe("findOrphans", () => {
  it("lists only objects with no record, and removes them only when asked", async () => {
    await record("private", "xensplit/g1/used.jpg", { thumbKey: "thumbs/xensplit/g1/used.jpg.webp" });
    await record("private", "xendrive/u1/gone.pdf"); // its object is missing
    await record("public", "avatar/a.jpg");
    await record("public", "recipaint-assets/mini.jpg", { thumbKey: "recipaint-assets/thumbs/mini.webp" });
    await record("public", "emoji/c1/e1.png");

    put("privateStore", "xensplit/g1/used.jpg");
    put("privateStore", "thumbs/xensplit/g1/used.jpg.webp");
    put("privateStore", "xensplit/g1/stray.jpg");
    put("privateStore", "db-backups/xendelta-hub-backup-2026-01-01T00-00-00-000Z.ndjson.gz");
    put("privateStore", "chat/c1/uploading.webm", new Date()); // too new to judge
    put("publicStore", "avatar/a.jpg");
    put("publicStore", "avatar/old.jpg");
    put("publicStore", "recipaint-assets/mini.jpg");
    put("publicStore", "recipaint-assets/thumbs/mini.webp");
    put("publicStore", "recipaint-assets/thumbs/lost.webp");
    put("publicStore", "emoji/c1/e1.png");

    const report = await orphans.findOrphans();
    expect(report.private.orphans.map((o) => o.key)).toEqual(["xensplit/g1/stray.jpg"]);
    expect(report.public.orphans.map((o) => o.key).sort()).toEqual([
      "avatar/old.jpg",
      "recipaint-assets/thumbs/lost.webp",
    ]);
    expect(report.missing.map((m) => `${m.bucket}/${m.key}`)).toEqual(["private/xendrive/u1/gone.pdf"]);
    expect(report.private.total).toBe(5);

    // A report alone changes nothing; removing deletes exactly the orphans.
    expect(memoryStores().privateStore.objects.has("xensplit/g1/stray.jpg")).toBe(true);
    const done = await orphans.removeOrphans(report);
    expect(done.objects).toBe(3);
    expect(memoryStores().privateStore.objects.has("xensplit/g1/stray.jpg")).toBe(false);
    expect(memoryStores().privateStore.objects.has("thumbs/xensplit/g1/used.jpg.webp")).toBe(true);
    expect(memoryStores().publicStore.objects.has("avatar/old.jpg")).toBe(false);
    expect(memoryStores().publicStore.objects.has("avatar/a.jpg")).toBe(true);
  });

  it("keeps a file's preview, and an object two buckets share a key with is judged per bucket", async () => {
    await record("private", "xendrive/u1/photo.jpg", {
      thumbKey: "thumbs/xendrive/u1/photo.jpg.webp",
      previewKey: "previews/xendrive/u1/photo.jpg.webp",
    });
    put("privateStore", "xendrive/u1/photo.jpg");
    put("privateStore", "thumbs/xendrive/u1/photo.jpg.webp");
    put("privateStore", "previews/xendrive/u1/photo.jpg.webp");
    put("privateStore", "thumbs/xendrive/u1/missing.jpg.webp");
    put("publicStore", "xendrive/u1/photo.jpg"); // same key, other bucket, no record

    const report = await orphans.findOrphans();
    expect(report.private.orphans.map((o) => o.key)).toEqual(["thumbs/xendrive/u1/missing.jpg.webp"]);
    expect(report.public.orphans.map((o) => o.key)).toEqual(["xendrive/u1/photo.jpg"]);
  });
});
