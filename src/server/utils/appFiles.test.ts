import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenDriveFile } from "../models/xendriveFile";
import { FileRecord } from "../models/fileRecord";
import { registerDriveSource } from "./driveSources";
import { storeAppFiles, removeAppFiles } from "./appFiles";
import { usageFor } from "./xendriveUtils";
import { FREE_STORAGE_BYTES } from "@shared/monetization";

// What happens when an app's files DO count toward storage: the path every app will take once counting is switched on.
const stored = new Set<string>();
vi.mock("./storageUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToStorage: vi.fn(async (_b: Buffer, path: string) => void stored.add(path)),
  deleteFromStorage: vi.fn(async (path: string) => void stored.delete(path)),
}));

registerDriveSource("counted-test", {
  label: "Counted",
  counts: async () => true,
  verify: async (_userId, ref) => ref !== "forbidden",
  describe: async (_userId, refs) => new Map(refs.map((r) => [r, r])),
});

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => stored.clear());

const file = (name: string, size = 100) => ({ buffer: Buffer.alloc(size), name, mimeType: "image/png" });

describe("storeAppFiles for an app whose files count", () => {
  it("stores tagged files that use the person's storage", async () => {
    const me = await createUser();
    const uid = String(me.user._id);
    const made = await storeAppFiles(uid, { app: "counted-test", ref: "r1" }, [file("a.png"), file("b.png", 50)]);
    expect(made).toHaveLength(2);
    expect(made.every((f) => f.counted === true && f.source?.ref === "r1" && f.folder_id === null)).toBe(true);
    expect(await usageFor(uid)).toEqual({ fileCount: 2, spaceUsed: 150 });
    expect(stored.size).toBe(2);
    // One record per file, with the file's own id, paid for by the uploader.
    const records = await FileRecord.find({ uploadedBy: uid }).lean();
    expect(records.map((r) => String(r._id)).sort()).toEqual(made.map((f) => String(f._id)).sort());
    expect(records[0]).toMatchObject({
      bucket: "private",
      payer: { type: "user", id: uid },
      space: { app: "counted-test", ref: "r1" },
    });
  });

  it("refuses with 413 when the files don't fit, and stores nothing", async () => {
    const me = await createUser();
    const uid = String(me.user._id);
    await XenDriveFile.create({
      owner_id: uid,
      name: "full.bin",
      storage_path: "xendrive/x/full.bin",
      mimeType: "application/octet-stream",
      size: FREE_STORAGE_BYTES - 10,
    });
    await expect(storeAppFiles(uid, { app: "counted-test", ref: "r1" }, [file("a.png")])).rejects.toMatchObject({
      status: 413,
    });
    expect(stored.size).toBe(0);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(1);
  });

  it("refuses a source the person may not store for, and an unknown app", async () => {
    const me = await createUser();
    const uid = String(me.user._id);
    await expect(storeAppFiles(uid, { app: "counted-test", ref: "forbidden" }, [file("a.png")])).rejects.toMatchObject({
      status: 404,
    });
    await expect(storeAppFiles(uid, { app: "nope", ref: "r" }, [file("a.png")])).rejects.toMatchObject({ status: 400 });
  });

  it("removeAppFiles deletes the records and the bytes, and ignores ids that are already gone", async () => {
    const me = await createUser();
    const uid = String(me.user._id);
    const made = await storeAppFiles(uid, { app: "counted-test", ref: "r1" }, [file("a.png"), file("b.png")]);
    await removeAppFiles([made[0]._id, "64b000000000000000000000"]);
    expect(await XenDriveFile.countDocuments({ owner_id: uid })).toBe(1);
    expect(await FileRecord.countDocuments({ uploadedBy: uid })).toBe(1);
    expect(await FileRecord.exists({ _id: made[0]._id })).toBeNull();
    expect(stored.size).toBe(1);
  });
});
