import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "../testing/testApp";

// The db:stats "unused data" report: collections no model uses, fields no schema defines, and older leftovers.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
  await import("../models/user.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("schemaDrift", () => {
  it("lists a collection with no model, a field the schema doesn't define, and old quota space", async () => {
    const db = mongoose.connection;
    await db.collection("xencasinos").insertOne({ chips: 10 });
    await db.collection("users").insertOne({ username: "a", weeabetsAccountId: "x", xendrive: { spaceAllowed: 5 } });

    const { schemaDrift } = await import("./dbStats.js");
    const drift = await schemaDrift();
    expect(drift.unmodelled).toContainEqual({ collection: "xencasinos", documents: 1 });
    expect(drift.unmodelled.map((c) => c.collection)).not.toContain("users");
    expect(drift.unknownFields).toContainEqual({ collection: "users", field: "weeabetsAccountId", documents: 1 });
    expect(drift.unknownFields.find((f) => f.field === "username")).toBeUndefined();
    expect(drift.legacy).toContainEqual({ label: "People with extra XenDrive space from the old quota", documents: 1 });
  });
});
