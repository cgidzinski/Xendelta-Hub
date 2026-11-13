import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1794900000000-xendrive-password-hash";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
});

describe("xendrive link password hash migration", () => {
  it("hashes plain-text passwords, drops the old field, keeps a newer hash, and is repeatable", async () => {
    const files = mongoose.connection.collection("xendrivefiles");
    const old = await files.insertOne({ name: "old.txt", password: "hunter2" });
    const newer = await files.insertOne({ name: "newer.txt", password: "stale", passwordHash: "$2a$10$existing" });
    const none = await files.insertOne({ name: "none.txt" });
    const blank = await files.insertOne({ name: "blank.txt", password: "" });

    await migration.up(mongoose.connection);

    const a = await files.findOne({ _id: old.insertedId });
    expect(a).not.toHaveProperty("password");
    expect(await bcrypt.compare("hunter2", a!.passwordHash)).toBe(true);
    expect(a!.passwordHash).not.toContain("hunter2");

    const b = await files.findOne({ _id: newer.insertedId });
    expect(b).not.toHaveProperty("password");
    expect(b!.passwordHash).toBe("$2a$10$existing");

    expect(await files.findOne({ _id: none.insertedId })).not.toHaveProperty("passwordHash");
    const c = await files.findOne({ _id: blank.insertedId });
    expect(c).not.toHaveProperty("password");
    expect(c).not.toHaveProperty("passwordHash");

    await migration.up(mongoose.connection);
    expect((await files.findOne({ _id: old.insertedId }))!.passwordHash).toBe(a!.passwordHash);
  });

  it("can't be undone, and says why", async () => {
    await expect(migration.down()).rejects.toThrow(/irreversible/);
  });
});
