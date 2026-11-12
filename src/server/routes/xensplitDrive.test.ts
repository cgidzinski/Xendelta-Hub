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

// Expense photos are XenDrive files tagged to the group: owned by the uploader, listed under From apps, exempt from the
// quota for now, and removed with the photo, the group or the file. Only storage is faked.
const stored = new Set<string>();
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async (_b: Buffer, path: string) => void stored.add(path)),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
  deleteFromGCS: vi.fn(async (path: string) => void stored.delete(path)),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xensplit.js"), () => import("./xendrive.js")]);
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
  const group = await request(t.app)
    .post("/api/xensplit/groups")
    .set(auth(owner.token))
    .send({ name: "Weekend trip", default_currency: "CAD" });
  const groupId = group.body.data.group?._id ?? group.body.data._id;
  const expense = await request(t.app)
    .post(`/api/xensplit/groups/${groupId}/expenses`)
    .set(auth(owner.token))
    .send({
      paid_by: uid,
      amount: 20,
      currency: "CAD",
      title: "Dinner",
      date: new Date().toISOString(),
      split_type: "equal",
      splits: [{ user_id: uid }],
    });
  const expenseId = expense.body.data.newExpenseId;
  const photos = (n: number) => {
    let req = request(t.app)
      .post(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/images`)
      .set(auth(owner.token));
    for (let i = 0; i < n; i++) req = req.attach("images", PNG, { filename: `r${i}.png`, contentType: "image/png" });
    return req;
  };
  const urls = async () =>
    (
      await request(t.app)
        .get(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/image-urls`)
        .set(auth(owner.token))
    ).body.data as Array<{ _id: string; signedUrl: string }>;
  return { owner, uid, groupId, expenseId, photos, urls };
}

describe("XenSplit photos in XenDrive", () => {
  it("stores each photo as a tagged file owned by the uploader that doesn't count toward storage", async () => {
    const { owner, uid, groupId, photos, urls } = await setup();
    const before = await usageFor(uid);
    expect((await photos(2)).status).toBe(200);

    const files = await XenDriveFile.find({ owner_id: uid, "source.app": "xensplit" });
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.source?.ref === groupId && f.counted === false && f.folder_id === null)).toBe(true);
    expect(await usageFor(uid)).toEqual(before);
    expect(await urls()).toHaveLength(2);

    // listed under From apps with the group's name, marked as not counted
    const res = (await request(t.app).get("/api/xendrive/app-files").set(auth(owner.token))).body.data;
    expect(res.apps[0].label).toBe("XenSplit");
    expect(res.apps[0].groups[0].label).toBe("Weekend trip");
    expect(res.apps[0].groups[0].files.every((f: any) => f.counted === false)).toBe(true);
  });

  it("keeps the files out of My Drive unless asked for, by app or as outside the quota", async () => {
    const { owner, photos } = await setup();
    await photos(1);
    const browse = async (query: string) =>
      (await request(t.app).get(`/api/xendrive/browse${query}`).set(auth(owner.token))).body.data.files.map(
        (f: any) => f.name,
      );
    expect(await browse("")).toEqual([]);
    expect(await browse("?search=r0")).toEqual([]);
    expect(await browse("?source=all")).toEqual(["r0.png"]);
    expect(await browse("?source=xensplit")).toEqual(["r0.png"]);
    expect(await browse("?source=uncounted")).toEqual(["r0.png"]);
    expect(await browse("?source=chat")).toEqual([]);
  });

  it("deleting a photo removes its file and bytes", async () => {
    const { owner, uid, groupId, expenseId, photos, urls } = await setup();
    await photos(2);
    const [first] = await urls();
    const del = await request(t.app)
      .delete(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/images/${first._id}`)
      .set(auth(owner.token));
    expect(del.status).toBe(200);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(1);
    expect(stored.size).toBe(1);
  });

  it("deleting the file in XenDrive takes the photo off the expense", async () => {
    const { owner, uid, photos, urls } = await setup();
    await photos(2);
    const file = await XenDriveFile.findOne({ owner_id: uid });
    const del = await request(t.app).delete(`/api/xendrive/files/${file!._id}`).set(auth(owner.token));
    expect(del.status).toBe(200);
    expect(await urls()).toHaveLength(1);
  });

  it("deleting the group deletes its photos", async () => {
    const { owner, uid, groupId, photos } = await setup();
    await photos(3);
    expect(stored.size).toBe(3);
    const del = await request(t.app).delete(`/api/xensplit/groups/${groupId}`).set(auth(owner.token));
    expect(del.status).toBe(200);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(0);
    expect(stored.size).toBe(0);
  });

  it("refuses a photo for a group the person is not in", async () => {
    const { groupId, expenseId } = await setup();
    const stranger = await createUser();
    const res = await request(t.app)
      .post(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/images`)
      .set(auth(stranger.token))
      .attach("images", PNG, { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(403);
    expect(stored.size).toBe(0);
  });
});
