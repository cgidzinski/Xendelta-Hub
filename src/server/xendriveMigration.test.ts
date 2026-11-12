import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1794445962975-xenbox-to-xendrive";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("xenbox -> xendrive migration", () => {
  it("drops the dead file records, keeps quota, pins and vouchers, and reverses what it can", async () => {
    const conn = mongoose.connection;
    const users = conn.collection("users");
    await conn.collection("xenboxmedias").insertOne({ filename: "gone.txt" });
    await conn.collection("xenboxuploadsessions").insertOne({ upload_id: "u1" });
    const { insertedId } = await users.insertOne({
      username: "a",
      xenbox: { files: [1, 2], spaceAllowed: 5_000 },
      pinnedApps: ["xensplit", "xenbox"],
      inventory: [
        { itemKey: "1gb-xenbox-voucher", name: "1GB XenBox Voucher", description: "XenBox space", used: false },
        { itemKey: "other", name: "Other", used: false },
      ],
    });
    await users.insertOne({ username: "b", pinnedApps: ["xensplit"] });

    await migration.up(conn);
    await migration.up(conn); // repeatable

    const collections = (await conn.db!.listCollections().toArray()).map((c) => c.name);
    expect(collections).not.toContain("xenboxmedias");
    expect(collections).not.toContain("xenboxuploadsessions");

    const a = await users.findOne({ _id: insertedId });
    expect(a!.xendrive).toEqual({ spaceAllowed: 5_000 });
    expect(a!.xenbox).toBeUndefined();
    expect(a!.pinnedApps).toEqual(["xensplit", "xendrive"]);
    expect(a!.inventory[0]).toMatchObject({
      itemKey: "1gb-xendrive-voucher",
      name: "1GB XenDrive Voucher",
      used: false,
    });
    expect(a!.inventory[1]).toMatchObject({ itemKey: "other", name: "Other" });
    expect((await users.findOne({ username: "b" }))!.pinnedApps).toEqual(["xensplit"]);

    await migration.down(conn);
    const back = await users.findOne({ _id: insertedId });
    expect(back!.xenbox).toEqual({ spaceAllowed: 5_000 });
    expect(back!.xendrive).toBeUndefined();
    expect(back!.pinnedApps).toEqual(["xensplit", "xenbox"]);
    expect(back!.inventory[0].itemKey).toBe("1gb-xenbox-voucher");
  });
});
