import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "./testing/testApp";
import * as migration from "../../migrations/1795300000000-storage-to-r2";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
});
afterAll(async () => {
  await t.stop();
  delete process.env.STORAGE_PUBLIC_BASE_URL;
  delete process.env.GCS_PUBLIC_BUCKET_NAME;
});

const OLD = "https://storage.googleapis.com/xen-public";
const NEW = "https://files.example.com";

describe("storage to R2 migration", () => {
  it("needs the new address before changing anything", async () => {
    delete process.env.STORAGE_PUBLIC_BASE_URL;
    await expect(migration.up(mongoose.connection)).rejects.toThrow(/STORAGE_PUBLIC_BASE_URL/);
  });

  it("points stored public links at R2, anywhere in a document, repeatably and reversibly", async () => {
    const conn = mongoose.connection;
    process.env.STORAGE_PUBLIC_BASE_URL = `${NEW}/`;
    process.env.GCS_PUBLIC_BUCKET_NAME = "xen-public";
    const { insertedId: user } = await conn
      .collection("users")
      .insertOne({ username: "a", avatar: `${OLD}/avatar/a.jpg`, bio: "no links here" });
    const { insertedId: post } = await conn.collection("blogposts").insertOne({
      featuredImage: `${OLD}/blog-assets/cover.png`,
      assets: [`${OLD}/blog-assets/one.png`],
      content: `Look: ![x](${OLD}/blog-assets/one.png) and https://example.org/keep.png`,
    });
    const { insertedId: plain } = await conn
      .collection("users")
      .insertOne({ username: "b", avatar: "/avatars/default-avatar.png" });
    await conn.collection("xendriveuploadsessions").insertMany([
      { upload_id: "old", resumable_uri: "https://storage.googleapis.com/upload/x" },
      { upload_id: "new", storage_upload_id: "abc" },
    ]);

    await migration.up(conn);
    await migration.up(conn);

    expect((await conn.collection("users").findOne({ _id: user }))!.avatar).toBe(`${NEW}/avatar/a.jpg`);
    const p = (await conn.collection("blogposts").findOne({ _id: post }))!;
    expect(p.featuredImage).toBe(`${NEW}/blog-assets/cover.png`);
    expect(p.assets).toEqual([`${NEW}/blog-assets/one.png`]);
    expect(p.content).toBe(`Look: ![x](${NEW}/blog-assets/one.png) and https://example.org/keep.png`);
    expect((await conn.collection("users").findOne({ _id: plain }))!.avatar).toBe("/avatars/default-avatar.png");
    const sessions = await conn.collection("xendriveuploadsessions").find().toArray();
    expect(sessions.map((s) => s.upload_id)).toEqual(["new"]);

    await migration.down(conn);
    expect((await conn.collection("users").findOne({ _id: user }))!.avatar).toBe(`${OLD}/avatar/a.jpg`);
    expect((await conn.collection("blogposts").findOne({ _id: post }))!.content).toContain(
      `${OLD}/blog-assets/one.png`,
    );
  });
});
