import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1795000000000-xenkitchen-drop-tags";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("xenkitchen drop tags migration", () => {
  it("removes tags from every item, leaves everything else, and is repeatable", async () => {
    const items = mongoose.connection.collection("xenkitchenitems");
    const tagged = await items.insertOne({ title: "Curry", tags: ["spicy", "quick"], notes: "Hot" });
    const empty = await items.insertOne({ title: "Toast", tags: [] });
    const none = await items.insertOne({ title: "Soup" });

    await migration.up(mongoose.connection);
    await migration.up(mongoose.connection);

    const a = await items.findOne({ _id: tagged.insertedId });
    expect(a).not.toHaveProperty("tags");
    expect(a).toMatchObject({ title: "Curry", notes: "Hot" });
    expect(await items.findOne({ _id: empty.insertedId })).not.toHaveProperty("tags");
    expect(await items.findOne({ _id: none.insertedId })).toMatchObject({ title: "Soup" });
  });

  it("can't be undone, and says why", async () => {
    await expect(migration.down()).rejects.toThrow(/irreversible/);
  });
});
