import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenDriveFile } from "../models/xendriveFile";
import { XenKitchenItem } from "../models/xenKitchen";
import { usageFor } from "../utils/xendriveUtils";

// Photos are private XenDrive files tagged to the item: owned by the uploader, exempt from the quota for now, shown
// through signed links (also on a shared page), copied for each duplicate, and removed with the photo, the item or the
// file. Real routes, models and Mongo; only storage is faked, as two in-memory buckets.
const { priv, pub } = vi.hoisted(() => ({ priv: new Set<string>(), pub: new Set<string>() }));
vi.mock("../config/gcs", () => {
  const bucket = (name: string, set: Set<string>) => ({
    name,
    file: (path: string) => ({
      path,
      set,
      copy: async (dest: { path: string; set: Set<string> }) => {
        if (!set.has(path)) throw new Error("no such object");
        dest.set.add(dest.path);
      },
      getMetadata: async () => [{ size: "42", contentType: "image/webp" }],
    }),
  });
  return { privateBucket: bucket("private", priv), publicBucket: bucket("public", pub) };
});
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async (_b: Buffer, path: string, _t: string, isPrivate = false) => {
    (isPrivate ? priv : pub).add(path);
  }),
  deleteFromGCS: vi.fn(async (path: string, isPrivate = false) => void (isPrivate ? priv : pub).delete(path)),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenkitchen.js"), () => import("./xendrive.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  priv.clear();
  pub.clear();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function setup() {
  const me = await createUser();
  const uid = String(me.user._id);
  const books = await request(t.app).get("/api/xenkitchen/books").set(auth(me.token));
  const bookId = books.body.data.books[0]._id;
  const created = await request(t.app)
    .post("/api/xenkitchen/items")
    .set(auth(me.token))
    .send({ book_id: bookId, title: "Pancakes" });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const itemId = created.body.data.item._id;
  const photos = (n: number, id = itemId, token = me.token) => {
    let req = request(t.app).post(`/api/xenkitchen/items/${id}/images`).set(auth(token));
    for (let i = 0; i < n; i++) req = req.attach("images", PNG, { filename: `p${i}.png`, contentType: "image/png" });
    return req;
  };
  const item = async (id = itemId) =>
    (await request(t.app).get(`/api/xenkitchen/items/${id}`).set(auth(me.token))).body.data.item;
  return { me, uid, bookId, itemId, photos, item };
}

describe("XenKitchen photos in XenDrive", () => {
  it("stores photos privately as tagged files that don't count toward storage, shown by signed link", async () => {
    const { me, uid, itemId, photos } = await setup();
    const before = await usageFor(uid);
    const res = await photos(2);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const images = res.body.data.item.images;
    expect(images).toHaveLength(2);
    expect(images[0].url).toMatch(/^https:\/\/example\.test\/signed\/xendrive\//);
    expect(priv.size).toBe(2);
    expect(pub.size).toBe(0);

    const files = await XenDriveFile.find({ owner_id: uid, "source.app": "xenkitchen" });
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.source?.ref === itemId && f.counted === false)).toBe(true);
    expect(await usageFor(uid)).toEqual(before);

    const apps = (await request(t.app).get("/api/xendrive/app-files").set(auth(me.token))).body.data;
    expect(apps.apps[0]).toMatchObject({ app: "xenkitchen", label: "XenKitchen" });
    expect(apps.apps[0].groups[0].label).toBe("Pancakes");
  });

  it("serves the photos on a shared page", async () => {
    const { me, itemId, photos } = await setup();
    await photos(1);
    const shared = await request(t.app).post(`/api/xenkitchen/items/${itemId}/share`).set(auth(me.token));
    const token = shared.body.data.item.share.token;
    const page = await request(t.app).get(`/api/xenkitchen/public/${token}`);
    expect(page.status).toBe(200);
    expect(page.body.data.item.images[0].url).toMatch(/^https:\/\/example\.test\/signed\//);
  });

  it("a duplicate gets its own photos, and deleting it leaves the original's alone", async () => {
    const { me, uid, itemId, photos, item } = await setup();
    await photos(2);
    const dup = await request(t.app).post(`/api/xenkitchen/items/${itemId}/duplicate`).set(auth(me.token));
    expect(dup.status, JSON.stringify(dup.body)).toBe(200);
    expect(dup.body.data.item.images).toHaveLength(2);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(4);
    expect(priv.size).toBe(4);

    expect(
      (await request(t.app).delete(`/api/xenkitchen/items/${dup.body.data.item._id}`).set(auth(me.token))).status,
    ).toBe(200);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(2);
    expect(priv.size).toBe(2);
    expect((await item()).images).toHaveLength(2);
  });

  it("a photo can not be deleted in XenDrive, and deleting the item removes the rest", async () => {
    const { me, uid, itemId, photos, item } = await setup();
    const up = await photos(3);
    const first = up.body.data.item.images[0]._id;
    expect(
      (await request(t.app).delete(`/api/xenkitchen/items/${itemId}/images/${first}`).set(auth(me.token))).status,
    ).toBe(200);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(2);

    const file = await XenDriveFile.findOne({ owner_id: uid });
    expect((await request(t.app).delete(`/api/xendrive/files/${file!._id}`).set(auth(me.token))).status).toBe(400);
    expect((await item()).images).toHaveLength(2);

    expect((await request(t.app).delete(`/api/xenkitchen/items/${itemId}`).set(auth(me.token))).status).toBe(200);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(0);
    expect(priv.size).toBe(0);
  });

  it("still shows an older public photo, copies it privately on duplicate, and deletes it with its item", async () => {
    const { me, uid, itemId, item } = await setup();
    pub.add("xenkitchen/old/photo.webp");
    await XenKitchenItem.updateOne(
      { _id: itemId },
      { $push: { images: { gcs_path: "xenkitchen/old/photo.webp", url: "https://public.example/photo.webp" } } },
    );
    expect((await item()).images[0].url).toBe("https://public.example/photo.webp");

    const dup = await request(t.app).post(`/api/xenkitchen/items/${itemId}/duplicate`).set(auth(me.token));
    expect(dup.body.data.item.images[0].url).toMatch(/signed/);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(1);
    expect(priv.size).toBe(1);

    await request(t.app).delete(`/api/xenkitchen/items/${itemId}`).set(auth(me.token));
    expect(pub.size).toBe(0);
  });

  it("refuses photos from someone who can't edit the item", async () => {
    const { itemId, photos } = await setup();
    const stranger = await createUser();
    const res = await photos(1, itemId, stranger.token);
    expect(res.status).toBe(404);
    expect(priv.size).toBe(0);
  });
});
