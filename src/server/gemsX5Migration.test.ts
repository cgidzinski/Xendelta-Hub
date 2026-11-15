import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as opening from "../../migrations/1795100000000-gem-ledger-opening-balances";
import * as migration from "../../migrations/1795200000000-gems-x5";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("gems x5 migration", () => {
  it("multiplies every balance and fund by 5 through the ledger, once", async () => {
    const conn = mongoose.connection;
    const users = conn.collection("users");
    const communities = conn.collection("communities");
    const statements = conn.collection("billingstatements");
    const { insertedIds: u } = await users.insertMany([
      { username: "a", gems: 120 },
      { username: "b", gems: 0 },
    ]);
    const { insertedIds: c } = await communities.insertMany([{ name: "Club", members: [], fund: 30 }]);
    await opening.up(conn);
    // The community's 30 came from a donation the ledger recorded.
    await conn.collection("gemtransactions").insertOne({
      from: { type: "house" },
      to: { type: "community", id: c[0] },
      amount: 30,
      kind: "donation",
      status: "applied",
      idempotencyKey: "seed-fund",
    });
    await statements.insertOne({
      month: "2026-10",
      amountDue: 2,
      paid: 2,
      unpaid: 0,
      usageGems: 1.5,
      lines: [{ gems: 1.5, rate: 1 }],
    });

    await migration.up(conn);
    await migration.up(conn); // repeatable

    expect((await users.findOne({ _id: u[0] }))!.gems).toBe(600);
    expect((await users.findOne({ _id: u[1] }))!.gems).toBe(0);
    expect((await communities.findOne({ _id: c[0] }))!.fund).toBe(150);
    const s = await statements.findOne({ month: "2026-10" });
    expect(s).toMatchObject({ amountDue: 10, paid: 10, usageGems: 7.5, rescaledX5: true });
    expect(s!.lines[0]).toMatchObject({ gems: 7.5, rate: 5 });

    const { ledgerMismatches } = await import("./utils/dbStats.js");
    expect((await ledgerMismatches()).mismatches).toEqual([]);
    await expect(migration.down()).rejects.toThrow(/irreversible/);
  });
});
