import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as fileRecords from "../../migrations/1795600000000-file-records";
import * as appFiles from "../../migrations/1795700000000-app-files-to-records";
import * as migration from "../../migrations/1795900000000-slim-drive-files";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("slim drive files migration", () => {
  it("removes the fields the item no longer holds, leaves an item with no record alone, and reverses", async () => {
    const db = mongoose.connection;
    const files = db.collection("xendrivefiles");
    const u = new mongoose.Types.ObjectId();
    const full = {
      owner_id: u,
      name: "a.png",
      storage_path: `xendrive/${u}/a.png`,
      mimeType: "image/png",
      size: 10,
      thumbStatus: "none",
      counted: true,
      shareEnabled: true,
    };
    const { insertedIds } = await files.insertMany([
      full,
      { ...full, name: "b.png", storage_path: `xendrive/${u}/b.png` },
    ]);
    await fileRecords.up(db);
    await appFiles.up(db);
    // The second file's record is lost.
    await db.collection("filerecords").deleteOne({ _id: insertedIds[1] });

    await migration.up(db);
    await migration.up(db);

    const slim = await files.findOne({ _id: insertedIds[0] });
    expect(slim).toMatchObject({ name: "a.png", shareEnabled: true, file: insertedIds[0] });
    for (const gone of ["storage_path", "mimeType", "size", "thumbStatus", "counted"])
      expect(slim).not.toHaveProperty(gone);
    expect(await files.findOne({ _id: insertedIds[1] })).toMatchObject({
      storage_path: `xendrive/${u}/b.png`,
      size: 10,
    });

    await migration.down(db);
    expect(await files.findOne({ _id: insertedIds[0] })).toMatchObject({
      storage_path: `xendrive/${u}/a.png`,
      mimeType: "image/png",
      size: 10,
    });
  });
});
