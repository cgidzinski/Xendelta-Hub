import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestApp, type TestApp } from "../testing/testApp";
import { memoryStores } from "../storage";

// The binaries are missing (Windows dev, CI): video and PDF posters are skipped, and the file shows an icon instead.

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("child_process", () => ({ execFile: execFileMock }));

let t: TestApp;
let thumbs: typeof import("./xendriveThumbs");
beforeAll(async () => {
  execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: (e: Error) => void) =>
    cb(new Error("not found")),
  );
  t = await startTestApp([]);
  thumbs = await import("./xendriveThumbs.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("xendriveThumbs without ffmpeg / poppler", () => {
  it("skips a video poster and leaves the file without one", async () => {
    const storage_path = "xendrive/u1/video.mp4";
    await memoryStores().privateStore.put(storage_path, Buffer.from("video"), { contentType: "video/mp4" });

    expect(thumbs.thumbStatusFor("video/mp4")).toBe("pending");
    expect(await thumbs.generateThumbnail({ storage_path, mimeType: "video/mp4" })).toBeNull();
    expect(memoryStores().privateStore.objects.has(thumbs.thumbKey(storage_path))).toBe(false);
  });

  it("skips a PDF poster and leaves the file without one", async () => {
    const storage_path = "xendrive/u1/doc.pdf";
    await memoryStores().privateStore.put(storage_path, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" });

    expect(thumbs.thumbStatusFor("application/pdf")).toBe("pending");
    expect(await thumbs.generateThumbnail({ storage_path, mimeType: "application/pdf" })).toBeNull();
    expect(memoryStores().privateStore.objects.has(thumbs.thumbKey(storage_path))).toBe(false);
  });
});
