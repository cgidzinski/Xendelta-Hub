import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import { bucketView } from "./testing/storage";
import { publicUrlFor } from "./storage";
import * as migration from "../../migrations/1795600000000-file-records";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("file records migration", () => {
  it("makes a record per file (same _id), backfills public files, skips missing objects, and re-runs cleanly", async () => {
    const db = mongoose.connection;
    const files = db.collection("xendrivefiles");
    const records = db.collection("filerecords");
    const pub = bucketView("public");
    const [u, g, c] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

    const { insertedIds } = await files.insertMany([
      {
        owner_id: u,
        name: "mine.pdf",
        storage_path: `xendrive/${u}/mine.pdf`,
        mimeType: "application/pdf",
        size: 10,
        thumb: { path: `thumbs/xendrive/${u}/mine.pdf.webp` },
      },
      {
        owner_id: u,
        name: "r.jpg",
        storage_path: `xensplit/${g}/r.jpg`,
        mimeType: "image/jpeg",
        size: 20,
        source: { app: "xensplit", ref: String(g) },
      },
    ]);

    pub.add(`avatar/${u}.jpg`);
    pub.add("recipaint-assets/a.jpg");
    pub.add("recipaint-assets/thumbs/a.webp");
    pub.add("blog-assets/b.png");
    await db.collection("users").insertOne({ _id: u, avatar: publicUrlFor(`avatar/${u}.jpg`) });
    await db.collection("recipes").insertOne({
      author: u,
      showcase: [publicUrlFor("recipaint-assets/a.jpg"), publicUrlFor("recipaint-assets/gone.jpg")],
      steps: [],
    });
    await db.collection("blogposts").insertOne({ markdown: `see ${publicUrlFor("blog-assets/b.png")}`, assets: [] });
    await db.collection("customemojis").insertOne({ storagePath: "emoji/zzz/none.png", createdBy: String(u) });

    await migration.up(db);
    await migration.up(db);

    const mine = await records.findOne({ _id: insertedIds[0] });
    expect(mine).toMatchObject({
      bucket: "private",
      key: `xendrive/${u}/mine.pdf`,
      size: 10,
      payer: { type: "user", id: String(u) },
    });
    expect(mine?.space).toEqual({ app: "xendrive", ref: String(u) });
    expect(mine?.thumbKey).toBe(`thumbs/xendrive/${u}/mine.pdf.webp`);
    expect((await files.findOne({ _id: insertedIds[0] }))?.file).toEqual(insertedIds[0]);

    const photo = await records.findOne({ _id: insertedIds[1] });
    expect(photo?.space).toEqual({ app: "xensplit", ref: String(g) });
    expect(photo?.previewKey).toBeUndefined(); // no thumbnail yet, so no preview either
    expect((await files.findOne({ _id: insertedIds[1] }))?.file).toBeUndefined();

    const avatar = await records.findOne({ bucket: "public", key: `avatar/${u}.jpg` });
    expect(avatar?.payer).toEqual({ type: "house" });
    const recipe = await records.findOne({ bucket: "public", key: "recipaint-assets/a.jpg" });
    expect(recipe).toMatchObject({
      payer: { type: "user", id: String(u) },
      thumbKey: "recipaint-assets/thumbs/a.webp",
    });
    expect(await records.findOne({ bucket: "public", key: "recipaint-assets/gone.jpg" })).toBeNull();
    expect((await records.findOne({ bucket: "public", key: "blog-assets/b.png" }))?.payer).toEqual({ type: "house" });
    expect(await records.countDocuments({})).toBe(5);
    void c;
  });

  it("down removes the records and the links", async () => {
    const db = mongoose.connection;
    await migration.down(db);
    expect(await db.collection("filerecords").countDocuments({})).toBe(0);
    expect(await db.collection("xendrivefiles").countDocuments({ file: { $exists: true } })).toBe(0);
  });
});
