import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Storage and the network are faked; sessions, models and Mongo are real. The point: an upload
// session lives in the database, so it is still there after the "server" forgets everything it
// held in memory (which is what a restart or deploy does), and it belongs to whoever started it.

const deleted: string[] = [];
vi.mock("../config/gcs", () => ({
  privateBucket: {
    file: (path: string) => ({
      createResumableUpload: async () => ["https://storage.example.test/upload?id=1"],
      getMetadata: async () => [{ size: "6", contentType: "text/plain" }],
      exists: async () => [true],
      delete: async () => void deleted.push(path),
    }),
  },
}));
vi.mock("https", () => {
  const request = (_opts: unknown, cb: (res: { statusCode: number }) => void) => ({
    on: () => undefined,
    write: () => undefined,
    end: () => cb({ statusCode: 308 }),
  });
  return { default: { request }, request };
});

let t: TestApp;
let utils: typeof import("./xendriveUtils.js");
beforeAll(async () => {
  t = await startTestApp([() => import("../routes/xendrive.js")]);
  utils = await import("./xendriveUtils.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  deleted.length = 0;
});

const uid = (u: { user: { _id: unknown } }) => String(u.user._id);

describe("XenDrive upload sessions", () => {
  it("tracks chunks in the database and finishes the upload", async () => {
    const me = await createUser();
    const id = await utils.initiateChunkedUpload(uid(me), "notes.txt", 2);
    expect(await utils.getUploadSessionStatus(id, uid(me))).toEqual({ totalChunks: 2, receivedChunks: 0 });

    await utils.uploadChunk(id, uid(me), 0, Buffer.from("abc"));
    expect(await utils.getUploadSessionStatus(id, uid(me))).toEqual({ totalChunks: 2, receivedChunks: 1 });
    await expect(utils.finalizeChunkedUpload(id, uid(me))).rejects.toThrow(/Not all chunks received/);

    await utils.uploadChunk(id, uid(me), 1, Buffer.from("def"));
    const done = await utils.finalizeChunkedUpload(id, uid(me));
    expect(done.name).toBe("notes.txt"); // the person's own file name, not the storage name
    expect(done.size).toBe(6);
    expect(await utils.getUploadSessionStatus(id, uid(me))).toBeNull(); // finished sessions are removed
  });

  it("puts the file in the folder it was started in", async () => {
    const me = await createUser();
    const { XenDriveFolder } = await import("../models/xendriveFolder.js");
    const folder = await XenDriveFolder.create({ owner_id: me.user._id, name: "Docs" });
    const id = await utils.initiateChunkedUpload(uid(me), "a.txt", 1, folder.id);
    await utils.uploadChunk(id, uid(me), 0, Buffer.from("abcdef"));
    const done = await utils.finalizeChunkedUpload(id, uid(me));
    expect(done.folder_id).toBe(folder.id);
  });

  it("will not start an upload into someone else's folder", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const { XenDriveFolder } = await import("../models/xendriveFolder.js");
    const theirs = await XenDriveFolder.create({ owner_id: other.user._id, name: "Theirs" });
    await expect(utils.initiateChunkedUpload(uid(me), "a.txt", 1, theirs.id)).rejects.toThrow(/Folder not found/);
  });

  it("a resent chunk is counted once", async () => {
    const me = await createUser();
    const id = await utils.initiateChunkedUpload(uid(me), "a.txt", 2);
    await utils.uploadChunk(id, uid(me), 0, Buffer.from("abc"));
    await utils.uploadChunk(id, uid(me), 0, Buffer.from("abc"));
    expect((await utils.getUploadSessionStatus(id, uid(me)))!.receivedChunks).toBe(1);
  });

  it("rejects a chunk for an unknown session or an out-of-range index", async () => {
    const me = await createUser();
    await expect(utils.uploadChunk("nope", uid(me), 0, Buffer.from("x"))).rejects.toThrow(/session not found/);
    const id = await utils.initiateChunkedUpload(uid(me), "a.txt", 1);
    await expect(utils.uploadChunk(id, uid(me), 5, Buffer.from("x"))).rejects.toThrow(/Invalid chunk index/);
  });

  it("a session belongs to whoever started it: nobody else can read, feed, finish or cancel it", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const id = await utils.initiateChunkedUpload(uid(me), "mine.txt", 1);

    expect(await utils.getUploadSessionStatus(id, uid(other))).toBeNull();
    await expect(utils.uploadChunk(id, uid(other), 0, Buffer.from("x"))).rejects.toThrow(/session not found/);
    await expect(utils.finalizeChunkedUpload(id, uid(other))).rejects.toThrow(/session not found/);
    await utils.cleanupFailedUpload(id, uid(other)); // does nothing for a stranger
    expect(await utils.getUploadSessionStatus(id, uid(me))).not.toBeNull();
  });

  it("cancelling removes the session and the partial file", async () => {
    const me = await createUser();
    const id = await utils.initiateChunkedUpload(uid(me), "gone.txt", 1);
    await utils.cleanupFailedUpload(id, uid(me));
    expect(await utils.getUploadSessionStatus(id, uid(me))).toBeNull();
    expect(deleted.some((p) => p.includes(uid(me)))).toBe(true);
  });

  it("the scheduled cleanup removes sessions older than an hour and keeps fresh ones", async () => {
    const me = await createUser();
    const stale = await utils.initiateChunkedUpload(uid(me), "old.txt", 1);
    const fresh = await utils.initiateChunkedUpload(uid(me), "new.txt", 1);
    await mongoose.connection
      .collection("xendriveuploadsessions")
      .updateOne({ upload_id: stale }, { $set: { created_at: new Date(Date.now() - 2 * 3600_000) } });

    await utils.cleanupOldSessions();

    expect(await utils.getUploadSessionStatus(stale, uid(me))).toBeNull();
    expect(await utils.getUploadSessionStatus(fresh, uid(me))).not.toBeNull();
  });
});
