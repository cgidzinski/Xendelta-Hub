import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1795500000000-drop-unused-data";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("drop unused data migration", () => {
  it("drops only the listed collections and fields, and re-runs cleanly", async () => {
    const db = mongoose.connection;
    await db.collection("xencasinoactivities").insertOne({ x: 1 });
    await db.collection("xenfuture").insertOne({ x: 1 }); // an unknown collection is never touched
    const { insertedId } = await db.collection("users").insertOne({ username: "a", weeabetsAccountId: "w", gems: 3 });
    await db.collection("xenbudgetbooks").insertOne({ name: "Home", savings_goals: [] });

    await migration.up(db);
    await migration.up(db);

    const names = (await db.db!.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    expect(names).not.toContain("xencasinoactivities");
    expect(names).toContain("xenfuture");
    const user = await db.collection("users").findOne({ _id: insertedId });
    expect(user).toMatchObject({ username: "a", gems: 3 });
    expect(user!.weeabetsAccountId).toBeUndefined();
    expect((await db.collection("xenbudgetbooks").findOne({ name: "Home" }))!.savings_goals).toBeUndefined();
    await expect(migration.down()).rejects.toThrow(/irreversible/);
  });
});
