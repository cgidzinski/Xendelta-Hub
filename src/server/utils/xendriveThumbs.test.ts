import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestApp, type TestApp } from "../testing/testApp";
import { memoryStores } from "../storage";
import { XenDriveFile } from "../models/xendriveFile";
import { FileRecord } from "../models/fileRecord";
import { createDriveFile } from "../testing/files";
import {
  generateThumbnail,
  processPendingThumbnails,
  thumbKey,
  thumbStatusFor,
  thumbnailUrlFor,
} from "./xendriveThumbs";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  memoryStores().privateStore.clear();
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** A file waiting for its thumbnail: a record, plus the XenDrive item that points at it. */
const makeFile = async (name: string, size: number) => {
  const file = await createDriveFile({
    owner_id: new mongoose.Types.ObjectId(),
    name,
    storage_path: `xendrive/u1/${name}`,
    mimeType: "image/png",
    size,
  });
  await FileRecord.updateOne({ _id: file._id }, { $set: { thumbStatus: "pending" } });
  return file as unknown as { _id: unknown; storage_path: string };
};

describe("xendriveThumbs", () => {
  it("says which files get a thumbnail", () => {
    expect(thumbStatusFor("image/png")).toBe("pending");
    expect(thumbStatusFor("image/gif")).toBe("pending");
    expect(thumbStatusFor("application/pdf")).toBe("pending");
    expect(thumbStatusFor("video/mp4")).toBe("pending");
    expect(thumbStatusFor("application/zip")).toBe("none");
  });

  it("stores a WebP at thumbs/<storage_path>.webp, beside the original", async () => {
    const storage_path = "xendrive/u1/photo.png";
    await memoryStores().privateStore.put(storage_path, PNG, { contentType: "image/png" });

    const thumb = await generateThumbnail({ storage_path, mimeType: "image/png" });
    expect(thumb).not.toBeNull();
    expect(thumb!.path).toBe(thumbKey(storage_path));
    expect(thumb!.width).toBeGreaterThan(0);
    expect(memoryStores().privateStore.objects.get(thumb!.path)?.contentType).toBe("image/webp");
  });

  it("marks a file ready once made, and failed when generation fails (the file keeps working)", async () => {
    const good = await makeFile("a.png", PNG.length);
    await memoryStores().privateStore.put(good.storage_path, PNG, { contentType: "image/png" });

    const bad = await makeFile("b.png", 4);
    await memoryStores().privateStore.put(bad.storage_path, Buffer.from("nope"), { contentType: "image/png" });

    await processPendingThumbnails(10);
    const record = (await FileRecord.findById(good._id))!;
    expect(record.thumbStatus).toBe("ready");
    expect(record.thumbKey).toBe(thumbKey(good.storage_path));
    expect(record.previewKey).toBe(`previews/${good.storage_path}.webp`);
    // The XenDrive item gets the thumbnail copied onto it.
    expect((await XenDriveFile.findById(good._id))!.thumb?.path).toBe(thumbKey(good.storage_path));
    expect((await FileRecord.findById(bad._id))!.thumbStatus).toBe("failed");
  });

  it("signs a stable thumbnail link for the whole 6-hour window", async () => {
    const now = new Date("2026-01-01T00:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const a = await thumbnailUrlFor("xendrive/u1/a.png");
      const b = await thumbnailUrlFor("xendrive/u1/a.png");
      expect(a).toBe(b);
      expect(a).toContain("thumbs/xendrive/u1/a.png.webp");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
