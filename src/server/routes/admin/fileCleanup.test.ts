import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";
import { bucketView } from "../../testing/storage";
import { publicUrlFor } from "../../storage";

// What admin actions leave in storage: an avatar reset, deleting a person, and a blog edit that drops a file.

let t: TestApp;
let admin: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  t = await startTestApp([() => import("./index.js")]);
  admin = await createUser({ roles: ["admin"], username: "boss" });
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const pub = bucketView("public");
const priv = bucketView("private");
beforeEach(() => {
  pub.clear();
  priv.clear();
});
const auth = () => ({ Authorization: `Bearer ${admin.token}` });

describe("admin actions clean up storage", () => {
  it("resetting an avatar deletes the stored picture", async () => {
    pub.add("avatar/someone.jpg");
    const { user } = await createUser({ avatar: publicUrlFor("avatar/someone.jpg") });
    const res = await request(t.app).post(`/api/admin/users/${user._id}/avatar/reset`).set(auth());
    expect(res.status).toBe(200);
    expect(pub.has("avatar/someone.jpg")).toBe(false);
  });

  it("deleting a person removes their files, folders, avatar and Recipaint recipes, and the apps drop them", async () => {
    const { user } = await createUser({ username: "leaver", avatar: publicUrlFor("avatar/leaver.jpg") });
    const uid = user._id;
    pub.add("avatar/leaver.jpg");
    pub.add("recipaint-assets/mini.jpg");
    priv.add(`xendrive/${uid}/notes.pdf`);
    priv.add(`chat/c1/voice.webm`);
    const { createDriveFile } = await import("../../testing/files.js");
    const mime = "application/octet-stream";
    await createDriveFile({
      owner_id: uid,
      storage_path: `xendrive/${uid}/notes.pdf`,
      name: "notes.pdf",
      mimeType: mime,
    });
    await createDriveFile({
      owner_id: uid,
      storage_path: "chat/c1/voice.webm",
      name: "voice.webm",
      mimeType: mime,
      source: { app: "chat", ref: "c1" },
    });
    await mongoose.connection.collection("xendrivefolders").insertOne({ owner_id: uid, name: "Docs" });
    const { Recipe } = await import("../../models/recipe.js");
    await Recipe.create({
      title: "Mini",
      showcase: [publicUrlFor("recipaint-assets/mini.jpg")],
      author: uid,
      owner: uid,
    });

    const res = await request(t.app).delete(`/api/admin/users/${uid}`).set(auth()).send({ confirm: "leaver" });
    expect(res.status).toBe(200);
    expect(await mongoose.connection.collection("xendrivefiles").countDocuments({ owner_id: uid })).toBe(0);
    expect(await mongoose.connection.collection("filerecords").countDocuments({ uploadedBy: uid })).toBe(0);
    expect(await mongoose.connection.collection("xendrivefolders").countDocuments({ owner_id: uid })).toBe(0);
    expect(priv.size).toBe(0);
    expect(pub.has("avatar/leaver.jpg")).toBe(false);
    expect(pub.has("recipaint-assets/mini.jpg")).toBe(false);
    expect(await Recipe.countDocuments({ owner: uid })).toBe(0);
    const audit = await mongoose
      .model("AdminAudit")
      .findOne({ action: "user_delete" })
      .sort({ createdAt: -1 })
      .lean<any>();
    expect(audit.detail).toBe("Deleted the person and 2 files");
  });

  it("a blog edit that replaces the featured image deletes the old one, but not one the text still shows", async () => {
    const { BlogPost } = await import("../../models/blogPost.js");
    const [cover, inText, next] = ["blog-assets/cover.png", "blog-assets/inline.png", "blog-assets/new.png"];
    [cover, inText, next].forEach((k) => pub.add(k));
    const post = await BlogPost.create({
      title: "Hello",
      slug: "hello",
      markdown: `Look ![x](${publicUrlFor(inText)}) here`,
      publishDate: new Date(),
      assets: [publicUrlFor(inText)],
      featuredImage: publicUrlFor(cover),
      author: admin.user._id,
    });
    const res = await request(t.app)
      .put(`/api/admin/blog/${post._id}`)
      .set(auth())
      .send({ featuredImage: publicUrlFor(next) });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(pub.has(cover)).toBe(false);
    expect(pub.has(inText)).toBe(true);
    expect(pub.has(next)).toBe(true);
  });
});
