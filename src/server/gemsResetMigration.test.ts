import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1795200000000-gems-reset";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("gems reset migration", () => {
  it("sets every balance and fund to 0, empties inventories and clears the ledger, repeatably", async () => {
    const conn = mongoose.connection;
    const users = conn.collection("users");
    const communities = conn.collection("communities");
    const { insertedIds: u } = await users.insertMany([
      {
        username: "a",
        gems: 1200,
        inventory: [{ itemKey: "golden-badge" }],
        cosmetics: { badge: "golden-badge" },
        gemTxApplied: [new mongoose.Types.ObjectId()],
      },
      { username: "b" },
    ]);
    const { insertedIds: c } = await communities.insertMany([{ name: "Club", members: [], fund: 30 }]);
    await conn.collection("gemtransactions").insertOne({ kind: "donation", amount: 30, idempotencyKey: "x" });
    await conn.collection("gempurchases").insertOne({ gems: 1000, status: "completed" });

    await migration.up(conn);
    await migration.up(conn);

    const a = await users.findOne({ _id: u[0] });
    expect(a).toMatchObject({ gems: 0, inventory: [] });
    expect(a!.cosmetics?.badge).toBeUndefined();
    expect(a!.gemTxApplied).toBeUndefined();
    expect((await users.findOne({ _id: u[1] }))!.gems).toBe(0);
    expect((await communities.findOne({ _id: c[0] }))!.fund).toBe(0);
    expect(await conn.collection("gemtransactions").countDocuments()).toBe(0);
    expect(await conn.collection("gempurchases").countDocuments()).toBe(1);

    const { ledgerMismatches } = await import("./utils/dbStats.js");
    expect((await ledgerMismatches()).mismatches).toEqual([]);
    await expect(migration.down()).rejects.toThrow(/irreversible/);
  });
});
