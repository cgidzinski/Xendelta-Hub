import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1794530000000-points-to-gems";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("points -> gems migration", () => {
  it("keeps every balance and voucher, and reverses cleanly", async () => {
    const conn = mongoose.connection;
    const users = conn.collection("users");
    const { insertedId: richId } = await users.insertOne({
      username: "rich",
      points: 4200,
      inventory: [
        { itemKey: "1000-point-voucher", name: "1000 Point Voucher", description: "points", used: false },
        { itemKey: "golden-badge", name: "Golden Badge", used: false },
      ],
    });
    const { insertedId: zeroId } = await users.insertOne({ username: "zero", points: 0 });
    const { insertedId: newId } = await users.insertOne({ username: "new", gems: 0 });

    await migration.up(conn);

    const rich: any = await users.findOne({ _id: richId });
    expect(rich.gems).toBe(4200);
    expect(rich).not.toHaveProperty("points");
    expect(rich.inventory[0]).toMatchObject({ itemKey: "1000-gem-voucher", name: "1000 Gem Voucher" });
    expect(rich.inventory[0].description).toContain("gems");
    expect(rich.inventory[1].itemKey).toBe("golden-badge");
    expect(((await users.findOne({ _id: zeroId })) as any).gems).toBe(0);
    expect(((await users.findOne({ _id: newId })) as any).gems).toBe(0);

    // Running it again changes nothing.
    await migration.up(conn);
    expect(((await users.findOne({ _id: richId })) as any).gems).toBe(4200);

    await migration.down(conn);
    const back: any = await users.findOne({ _id: richId });
    expect(back.points).toBe(4200);
    expect(back).not.toHaveProperty("gems");
    expect(back.inventory[0]).toMatchObject({ itemKey: "1000-point-voucher", name: "1000 Point Voucher" });
  });
});
