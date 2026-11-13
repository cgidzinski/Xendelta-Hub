import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1795000000000-pinned-apps-unset-empty";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("pinned apps migration", () => {
  it("unsets empty lists so they mean 'never chosen', leaves real choices alone, and is repeatable", async () => {
    const users = mongoose.connection.collection("users");
    const empty = await users.insertOne({ username: "empty", pinnedApps: [] });
    const chose = await users.insertOne({ username: "chose", pinnedApps: ["xennote", "xenkitchen"] });
    const never = await users.insertOne({ username: "never" });

    await migration.up(mongoose.connection);
    const pins = async (id: mongoose.Types.ObjectId) => (await users.findOne({ _id: id }))?.pinnedApps;
    expect(await pins(empty.insertedId)).toBeUndefined();
    expect(await pins(chose.insertedId)).toEqual(["xennote", "xenkitchen"]);
    expect(await pins(never.insertedId)).toBeUndefined();

    await migration.up(mongoose.connection);
    expect(await pins(chose.insertedId)).toEqual(["xennote", "xenkitchen"]);
    await migration.down();
  });
});
