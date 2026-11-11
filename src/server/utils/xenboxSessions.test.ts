import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Storage and the network are faked; sessions, models and Mongo are real. The point: an upload
// session lives in the database, so it is still there after the "server" forgets everything it
// held in memory (which is what a restart or deploy does).

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
let utils: typeof import("./xenboxUtils.js");
beforeAll(async () => {
  t = await startTestApp([() => import("../routes/xenbox.js")]);
  utils = await import("./xenboxUtils.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  deleted.length = 0;
});

describe("XenBox upload sessions", () => {
  it("tracks chunks in the database and finishes the upload", async () => {
    const { user } = await createUser();
    const id = await utils.initiateChunkedUpload(user._id.toString(), "notes.txt", 2);
    expect(await utils.getUploadSessionStatus(id)).toEqual({ totalChunks: 2, receivedChunks: 0 });

    await utils.uploadChunk(id, 0, Buffer.from("abc"));
    expect(await utils.getUploadSessionStatus(id)).toEqual({ totalChunks: 2, receivedChunks: 1 });
    await expect(utils.finalizeChunkedUpload(id)).rejects.toThrow(/Not all chunks received/);

    await utils.uploadChunk(id, 1, Buffer.from("def"));
    const done = await utils.finalizeChunkedUpload(id);
    expect(done.filename).toMatch(/notes/);
    expect(done.size).toBe(6);
    expect(await utils.getUploadSessionStatus(id)).toBeNull(); // finished sessions are removed
  });

  it("a resent chunk is counted once", async () => {
    const { user } = await createUser();
    const id = await utils.initiateChunkedUpload(user._id.toString(), "a.txt", 2);
    await utils.uploadChunk(id, 0, Buffer.from("abc"));
    await utils.uploadChunk(id, 0, Buffer.from("abc"));
    expect((await utils.getUploadSessionStatus(id))!.receivedChunks).toBe(1);
  });

  it("rejects a chunk for an unknown session or an out-of-range index", async () => {
    const { user } = await createUser();
    await expect(utils.uploadChunk("nope", 0, Buffer.from("x"))).rejects.toThrow(/session not found/);
    const id = await utils.initiateChunkedUpload(user._id.toString(), "a.txt", 1);
    await expect(utils.uploadChunk(id, 5, Buffer.from("x"))).rejects.toThrow(/Invalid chunk index/);
  });

  it("cancelling removes the session and the partial file", async () => {
    const { user } = await createUser();
    const id = await utils.initiateChunkedUpload(user._id.toString(), "gone.txt", 1);
    await utils.cleanupFailedUpload(id);
    expect(await utils.getUploadSessionStatus(id)).toBeNull();
    expect(deleted.some((p) => p.includes(user._id.toString()))).toBe(true);
  });

  it("the scheduled cleanup removes sessions older than an hour and keeps fresh ones", async () => {
    const { user } = await createUser();
    const stale = await utils.initiateChunkedUpload(user._id.toString(), "old.txt", 1);
    const fresh = await utils.initiateChunkedUpload(user._id.toString(), "new.txt", 1);
    await mongoose.connection
      .collection("xenboxuploadsessions")
      .updateOne({ upload_id: stale }, { $set: { created_at: new Date(Date.now() - 2 * 3600_000) } });

    await utils.cleanupOldSessions();

    expect(await utils.getUploadSessionStatus(stale)).toBeNull();
    expect(await utils.getUploadSessionStatus(fresh)).not.toBeNull();
  });
});
