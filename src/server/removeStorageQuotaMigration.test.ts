import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1796000000000-remove-storage-quota";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("remove storage quota migration", () => {
  it("drops extra space, 1 GB vouchers and the counted flag, keeps everything else, and re-runs cleanly", async () => {
    const db = mongoose.connection;
    const users = db.collection("users");
    const { insertedIds } = await users.insertMany([
      {
        username: "holder",
        xendrive: { spaceAllowed: 5 * 1024 ** 3 },
        inventory: [
          { itemKey: "1gb-xendrive-voucher", used: false },
          { itemKey: "golden-badge", used: false },
        ],
      },
      { username: "plain", gems: 7 },
    ]);
    await db.collection("filerecords").insertOne({ bucket: "private", key: "a", counted: false });

    await migration.up(db);
    await migration.up(db);

    const holder = await users.findOne({ _id: insertedIds[0] });
    expect(holder).not.toHaveProperty("xendrive");
    expect(holder?.inventory.map((i: { itemKey: string }) => i.itemKey)).toEqual(["golden-badge"]);
    expect(await users.findOne({ _id: insertedIds[1] })).toMatchObject({ username: "plain", gems: 7 });
    expect(await db.collection("filerecords").findOne({ key: "a" })).not.toHaveProperty("counted");

    await expect(migration.down()).rejects.toThrow(/irreversible/);
  });
});
