import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Which apps someone already uses (GET /api/feed/usage), for the "Did you know?" tips on Home: a thing they made or belong to
// counts, an app's own files and other people's things do not.
vi.hoisted(() => {
  process.env.GCS_PUBLIC_BUCKET_NAME = "test-public";
  process.env.GCS_PRIVATE_BUCKET_NAME = "test-private";
});

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./xensplit.js"),
    () => import("./xennote/index.js"),
    () => import("./xenlink.js"),
    () => import("./feed/index.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type Who = Awaited<ReturnType<typeof createUser>>;
const as = (w: Who) => ({ Authorization: `Bearer ${w.token}` });
const used = async (w: Who) =>
  ((await request(t.app).get("/api/feed/usage").set(as(w))).body.data.used as string[]).sort();

describe("which apps are tracked", () => {
  it("is every app in the guide, so a new app can't be left out of the tips (add it to feed/appUsage.ts)", async () => {
    const { TRACKED_APPS } = await import("../feed/appUsage.js");
    const { GUIDE_APPS } = await import("../../shared/appGuide.js");
    expect([...TRACKED_APPS].sort()).toEqual(GUIDE_APPS.filter((a) => a !== "hub").sort());
  });
});

describe("which apps someone uses", () => {
  it("needs a signed-in person", async () => {
    expect((await request(t.app).get("/api/feed/usage")).status).toBe(401);
  });

  it("nothing for someone who has made nothing", async () => {
    expect(await used(await createUser())).toEqual([]);
  });

  it("an app counts once they have something in it, and only that app", async () => {
    const ann = await createUser();
    const note = await request(t.app)
      .post("/api/xennote/notes")
      .set(as(ann))
      .send({ type: "text", title: "Hi", body: "x" });
    expect(note.status).toBe(200);
    expect(await used(ann)).toEqual(["xennote"]);

    await request(t.app).post("/api/xenlink").set(as(ann)).send({ name: "Go", url: "https://go.example" });
    expect(await used(ann)).toEqual(["xenlink", "xennote"]);
  });

  it("belonging to someone else's group counts, other people's things do not", async () => {
    const owner = await createUser();
    const friend = await createUser();
    const bystander = await createUser();
    const res = await request(t.app)
      .post("/api/xensplit/groups")
      .set(as(owner))
      .send({ name: "Trip", default_currency: "CAD", memberIds: [friend.user._id.toString()] });
    expect(res.status).toBe(200);
    expect(await used(owner)).toEqual(["xensplit"]);
    expect(await used(friend)).toEqual(["xensplit"]);
    expect(await used(bystander)).toEqual([]);
  });

  it("a file they uploaded counts for XenDrive, a file an app stored for them does not", async () => {
    const { XenDriveFile } = await import("../models/xendriveFile.js");
    const ann = await createUser();
    await XenDriveFile.create({
      owner_id: ann.user._id,
      folder_id: null,
      name: "chat.png",
      storage_path: `xendrive/${ann.user._id}/chat.png-x`,
      mimeType: "image/png",
      size: 10,
      source: { app: "chat", ref: "c1" },
    });
    expect(await used(ann)).toEqual([]);
    await XenDriveFile.create({
      owner_id: ann.user._id,
      folder_id: null,
      name: "mine.png",
      storage_path: `xendrive/${ann.user._id}/mine.png-x`,
      mimeType: "image/png",
      size: 10,
    });
    expect(await used(ann)).toEqual(["xendrive"]);
  });
});
