import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1794800000000-xenlink-owner-id";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("xenlink owner_id migration", () => {
  it("stamps each link with its owner, removes users.xenlink, is repeatable and reversible", async () => {
    const conn = mongoose.connection;
    const users = conn.collection("users");
    const links = conn.collection("xenlinks");

    const l1 = await links.insertOne({ name: "one", url: "https://a.example", slug: "1" });
    const l2 = await links.insertOne({ name: "two", url: "https://b.example", slug: "2" });
    const l3 = await links.insertOne({ name: "three", url: "https://c.example", slug: "3" });
    const orphan = await links.insertOne({ name: "orphan", url: "https://d.example", slug: "4" });
    const ann = await users.insertOne({ username: "ann", xenlink: [l1.insertedId, l2.insertedId] });
    const bob = await users.insertOne({ username: "bob", xenlink: [l3.insertedId] });
    const cy = await users.insertOne({ username: "cy", xenlink: [] });

    await migration.up(conn);

    const owner = async (id: mongoose.Types.ObjectId) => (await links.findOne({ _id: id }))?.owner_id;
    expect(await owner(l1.insertedId)).toBe(String(ann.insertedId));
    expect(await owner(l2.insertedId)).toBe(String(ann.insertedId));
    expect(await owner(l3.insertedId)).toBe(String(bob.insertedId));
    expect(await owner(orphan.insertedId)).toBeUndefined();
    expect(await users.countDocuments({ xenlink: { $exists: true } })).toBe(0);
    expect(await links.indexExists("owner_id_1")).toBe(true);

    // Running it again changes nothing.
    await migration.up(conn);
    expect(await owner(l1.insertedId)).toBe(String(ann.insertedId));

    await migration.down(conn);
    const annAfter = await users.findOne({ _id: ann.insertedId });
    expect((annAfter?.xenlink ?? []).map(String).sort()).toEqual([String(l1.insertedId), String(l2.insertedId)].sort());
    const bobAfter = await users.findOne({ _id: bob.insertedId });
    expect((bobAfter?.xenlink ?? []).map(String)).toEqual([String(l3.insertedId)]);
    expect((await users.findOne({ _id: cy.insertedId }))?.xenlink).toBeUndefined();
    expect(await links.countDocuments({ owner_id: { $exists: true } })).toBe(0);
    expect(await links.indexExists("owner_id_1")).toBe(false);
  });
});
