import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenDriveFile } from "../models/xendriveFile";
import { usageFor } from "../utils/xendriveUtils";

// The model below loads storage config at import time, before the test app sets its environment.
vi.hoisted(() => {
  process.env.GCS_PUBLIC_BUCKET_NAME = "test-public";
  process.env.GCS_PRIVATE_BUCKET_NAME = "test-private";
});

// Item photos are XenDrive files tagged to the book: owned by the uploader, listed under From apps, exempt from the
// quota for now, and removed with the photo, the item, the book or the file. Only storage is faked.
const stored = new Set<string>();
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async (_b: Buffer, path: string) => void stored.add(path)),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
  deleteFromGCS: vi.fn(async (path: string) => void stored.delete(path)),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenbudget/index.js"), () => import("./xendrive.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => stored.clear());

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function setup() {
  const owner = await createUser();
  const uid = String(owner.user._id);
  const created = await request(t.app)
    .post("/api/xenbudget/books")
    .set(auth(owner.token))
    .send({ name: "Home", default_currency: "CAD" });
  const bookId = (created.body.data.book ?? created.body.data)._id;
  const b = `/api/xenbudget/books/${bookId}`;
  const item = await request(t.app).post(`${b}/items`).set(auth(owner.token)).send({
    type: "expense",
    amount: 12,
    currency: "CAD",
    date: new Date().toISOString(),
    description: "Hardware store",
  });
  const itemId = (item.body.data.item ?? item.body.data)._id;
  const photos = (n: number) => {
    let req = request(t.app).post(`${b}/items/${itemId}/images`).set(auth(owner.token));
    for (let i = 0; i < n; i++) req = req.attach("images", PNG, { filename: `r${i}.png`, contentType: "image/png" });
    return req;
  };
  const urls = async () =>
    (await request(t.app).get(`${b}/items/${itemId}/image-urls`).set(auth(owner.token))).body.data as Array<{
      _id: string;
      signedUrl: string;
    }>;
  return { owner, uid, bookId, b, itemId, photos, urls };
}

describe("XenBudget photos in XenDrive", () => {
  it("stores each photo as a tagged file owned by the uploader that doesn't count toward storage", async () => {
    const { owner, uid, bookId, photos, urls } = await setup();
    const before = await usageFor(uid);
    const res = await photos(2);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const files = await XenDriveFile.find({ owner_id: uid, "source.app": "xenbudget" });
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.source?.ref === bookId && f.counted === false)).toBe(true);
    expect(await usageFor(uid)).toEqual(before);
    expect(await urls()).toHaveLength(2);

    const apps = (await request(t.app).get("/api/xendrive/app-files").set(auth(owner.token))).body.data;
    expect(apps.apps[0]).toMatchObject({ app: "xenbudget", label: "XenBudget" });
    expect(apps.apps[0].groups[0].label).toBe("Home");
  });

  it("a photo that does not count toward storage can only be removed from the item, not from XenDrive", async () => {
    const { owner, uid, b, itemId, photos, urls } = await setup();
    await photos(3);
    const [first] = await urls();
    const del = await request(t.app).delete(`${b}/items/${itemId}/images/${first._id}`).set(auth(owner.token));
    expect(del.status).toBe(200);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(2);

    const file = await XenDriveFile.findOne({ owner_id: uid });
    expect((await request(t.app).delete(`/api/xendrive/files/${file!._id}`).set(auth(owner.token))).status).toBe(400);
    expect(await urls()).toHaveLength(2);
  });

  it("deleting the item or the book deletes its photos", async () => {
    const { owner, uid, bookId, b, itemId, photos } = await setup();
    await photos(2);
    expect((await request(t.app).delete(`${b}/items/${itemId}`).set(auth(owner.token))).status).toBe(200);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(0);
    expect(stored.size).toBe(0);

    const second = await setup();
    await second.photos(2);
    expect(stored.size).toBe(2);
    expect(
      (await request(t.app).delete(`/api/xenbudget/books/${second.bookId}`).set(auth(second.owner.token))).status,
    ).toBe(200);
    expect(stored.size).toBe(0);
    expect(bookId).toBeTruthy();
  });

  it("refuses a photo from someone who is not in the book", async () => {
    const { b, itemId } = await setup();
    const stranger = await createUser();
    const res = await request(t.app)
      .post(`${b}/items/${itemId}/images`)
      .set(auth(stranger.token))
      .attach("images", PNG, { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(403);
    expect(stored.size).toBe(0);
  });
});
