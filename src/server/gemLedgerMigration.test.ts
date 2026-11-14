import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1795100000000-gem-ledger-opening-balances";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("gem ledger opening balances migration", () => {
  it("records one opening balance per person holding gems, is repeatable, and reverses", async () => {
    const conn = mongoose.connection;
    const users = conn.collection("users");
    const tx = conn.collection("gemtransactions");
    const { insertedIds } = await users.insertMany([
      { username: "rich", gems: 250 },
      { username: "broke", gems: 0 },
      { username: "old" },
    ]);

    await migration.up(conn);
    await migration.up(conn); // idempotent
    const rows = await tx.find({ kind: "opening_balance" }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 250, status: "applied", from: { type: "house" } });
    expect(String(rows[0].to.id)).toBe(String(insertedIds[0]));
    expect((await users.findOne({ _id: insertedIds[0] }))!.gems).toBe(250);

    const { ledgerMismatches } = await import("./utils/dbStats.js");
    expect((await ledgerMismatches()).mismatches).toEqual([]);

    await migration.down(conn);
    expect(await tx.countDocuments({ kind: "opening_balance" })).toBe(0);
  });
});
