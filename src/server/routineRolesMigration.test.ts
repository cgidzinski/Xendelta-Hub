import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1794428365588-routine-sharer-to-editor";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("routine sharer -> editor migration", () => {
  it("renames sharer to editor, leaves owners alone, is repeatable, and reverses exactly", async () => {
    const conn = mongoose.connection;
    const routines = conn.collection("xenroutines");
    await routines.insertMany([
      {
        name: "a",
        members: [
          { user_id: "1", role: "owner", muted: false },
          { user_id: "2", role: "sharer", muted: true, lead_days: 3 },
        ],
      },
      { name: "b", members: [{ user_id: "1", role: "owner" }] },
    ]);
    const roles = async () =>
      (await routines.find().sort({ name: 1 }).toArray()).map((r) => r.members.map((m: any) => m.role));

    await migration.up(conn);
    expect(await roles()).toEqual([["owner", "editor"], ["owner"]]);
    // per-member extras survive
    const a = await routines.findOne({ name: "a" });
    expect(a!.members[1]).toMatchObject({ user_id: "2", muted: true, lead_days: 3 });

    await migration.up(conn); // idempotent
    expect(await roles()).toEqual([["owner", "editor"], ["owner"]]);

    await migration.down(conn);
    expect(await roles()).toEqual([["owner", "sharer"], ["owner"]]);
  });
});
