import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "../testing/testApp";
import { memoryStores, publicUrlFor } from "../storage";

// The orphan finder: what nothing in the database uses is listed (and deleted only when asked); everything in use,
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

describe("findOrphans", () => {
  it("lists only unused files, and removes them only when asked", async () => {
    const db = mongoose.connection;
    await db
      .collection("xendrivefiles")
      .insertMany([{ storage_path: "xensplit/g1/used.jpg" }, { storage_path: "xendrive/u1/gone.pdf" }]);
    await db.collection("users").insertOne({ username: "a", avatar: publicUrlFor("avatar/a.jpg") });
    await db
      .collection("blogposts")
      .insertOne({ markdown: `See ![x](${publicUrlFor("blog-assets/inline.png")}) here` });
    await db.collection("recipes").insertOne({ showcase: [publicUrlFor("recipaint-assets/mini.jpg")] });
    await db.collection("customemojis").insertOne({ storagePath: "emoji/c1/e1.png" });

    put("privateStore", "xensplit/g1/used.jpg");
    put("privateStore", "xensplit/g1/stray.jpg");
    put("privateStore", "db-backups/xendelta-hub-backup-2026-01-01T00-00-00-000Z.ndjson.gz");
    put("privateStore", "chat/c1/uploading.webm", new Date()); // too new to judge
    put("publicStore", "avatar/a.jpg");
    put("publicStore", "avatar/old.jpg");
    put("publicStore", "blog-assets/inline.png");
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
    expect(report.missing.map((m) => m.storage_path)).toEqual(["xendrive/u1/gone.pdf"]);
    expect(orphans.byFolder(report.public.orphans)).toEqual({
      avatar: { count: 1, bytes: 10 },
      "recipaint-assets": { count: 1, bytes: 10 },
    });

    // Finding changes nothing.
    expect(memoryStores().privateStore.objects.has("xensplit/g1/stray.jpg")).toBe(true);

    expect(await orphans.removeOrphans(report)).toEqual({ objects: 3, bytes: 30 });
    expect(memoryStores().privateStore.objects.has("xensplit/g1/stray.jpg")).toBe(false);
    expect(memoryStores().privateStore.objects.has("xensplit/g1/used.jpg")).toBe(true);
    expect(memoryStores().publicStore.objects.has("avatar/old.jpg")).toBe(false);
    expect(memoryStores().publicStore.objects.has("recipaint-assets/thumbs/mini.webp")).toBe(true);
  });

  it("keeps a XenDrive file's thumbnail and flags a thumbnail whose file is gone", async () => {
    const db = mongoose.connection;
    await db.collection("xendrivefiles").insertMany([{ storage_path: "xendrive/u1/photo.jpg" }]);
    put("privateStore", "xendrive/u1/photo.jpg");
    put("privateStore", "thumbs/xendrive/u1/photo.jpg.webp");
    put("privateStore", "thumbs/xendrive/u1/missing.jpg.webp");

    const report = await orphans.findOrphans();
    expect(report.private.orphans.map((o) => o.key)).toEqual(["thumbs/xendrive/u1/missing.jpg.webp"]);
  });
});
