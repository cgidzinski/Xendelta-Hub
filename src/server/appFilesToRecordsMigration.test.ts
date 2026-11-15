import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as fileRecords from "../../migrations/1795600000000-file-records";
import * as migration from "../../migrations/1795700000000-app-files-to-records";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("app files to records migration", () => {
  it("deletes the XenDrive items apps stored, keeps the records, carries the flags over, and re-runs cleanly", async () => {
    const db = mongoose.connection;
    const files = db.collection("xendrivefiles");
    const records = db.collection("filerecords");
    const [u, g] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const { insertedIds } = await files.insertMany([
      {
        owner_id: u,
        name: "mine.png",
        storage_path: `xendrive/${u}/mine.png`,
        mimeType: "image/png",
        size: 10,
        thumbStatus: "pending",
      },
      {
        owner_id: u,
        name: "r.jpg",
        storage_path: `xensplit/${g}/r.jpg`,
        mimeType: "image/jpeg",
        size: 20,
        counted: false,
        thumb: { path: `thumbs/xensplit/${g}/r.jpg.webp`, width: 320, height: 200 },
        thumbStatus: "ready",
        source: { app: "xensplit", ref: String(g) },
      },
    ]);

    await fileRecords.up(db);
    await migration.up(db);
    await migration.up(db);

    expect(await files.countDocuments({})).toBe(1);
    expect(await files.findOne({ _id: insertedIds[0] })).toMatchObject({ thumbStatus: "none" });
    expect(await records.findOne({ _id: insertedIds[0] })).toMatchObject({ counted: true, thumbStatus: "pending" });
    expect(await records.findOne({ _id: insertedIds[1] })).toMatchObject({
      space: { app: "xensplit", ref: String(g) },
      counted: false,
      thumbKey: `thumbs/xensplit/${g}/r.jpg.webp`,
      thumbWidth: 320,
      thumbHeight: 200,
      thumbStatus: "ready",
    });
    expect(await records.countDocuments({})).toBe(2);

    // down brings the items back for the older version.
    await migration.down(db);
    expect(await files.findOne({ _id: insertedIds[1] })).toMatchObject({
      source: { app: "xensplit", ref: String(g) },
      storage_path: `xensplit/${g}/r.jpg`,
      counted: false,
    });
    expect(await files.countDocuments({})).toBe(2);
  });
});
