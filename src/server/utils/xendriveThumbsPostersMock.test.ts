import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs/promises";
import { startTestApp, type TestApp } from "../testing/testApp";
import { memoryStores } from "../storage";

// The binaries answer: the ffmpeg/pdftoppm steps are mocked (a real 1x1 PNG frame stands in for the poster).

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("child_process", () => ({ execFile: execFileMock }));

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Cb = (error: Error | null, stdout?: Buffer, stderr?: string) => void;

let t: TestApp;
let thumbs: typeof import("./xendriveThumbs");
beforeAll(async () => {
  execFileMock.mockImplementation((bin: string, args: string[], _opts: unknown, cb: Cb) => {
    if (args[0] === "-version") return cb(null, Buffer.alloc(0), "");
    if (bin === "ffmpeg") return cb(null, PNG, "");
    if (bin === "pdftoppm") {
      void fs.writeFile(`${args[args.length - 1]}-1.png`, PNG).then(() => cb(null, Buffer.alloc(0), ""));
      return;
    }
    cb(new Error(`Unexpected command: ${bin}`));
  });
  t = await startTestApp([]);
  thumbs = await import("./xendriveThumbs.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

describe("xendriveThumbs posters", () => {
  it("makes a video poster from a mocked ffmpeg frame", async () => {
    const storage_path = "xendrive/u1/video.mp4";
    await memoryStores().privateStore.put(storage_path, Buffer.from("video"), { contentType: "video/mp4" });

    const thumb = await thumbs.generateThumbnail({ storage_path, mimeType: "video/mp4" });
    expect(thumb).not.toBeNull();
    expect(thumb!.path).toBe(thumbs.thumbKey(storage_path));
    expect(thumb!.width).toBeGreaterThan(0);
    expect(memoryStores().privateStore.objects.get(thumb!.path)?.contentType).toBe("image/webp");
  });

  it("makes a PDF poster from a mocked pdftoppm render", async () => {
    const storage_path = "xendrive/u1/doc.pdf";
    await memoryStores().privateStore.put(storage_path, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" });

    const thumb = await thumbs.generateThumbnail({ storage_path, mimeType: "application/pdf" });
    expect(thumb).not.toBeNull();
    expect(thumb!.path).toBe(thumbs.thumbKey(storage_path));
    expect(thumb!.width).toBeGreaterThan(0);
    expect(memoryStores().privateStore.objects.get(thumb!.path)?.contentType).toBe("image/webp");
  });

  it("skips a PDF over the size cap", async () => {
    const storage_path = "xendrive/u1/huge.pdf";
    await memoryStores().privateStore.put(storage_path, Buffer.alloc(21 * 1024 * 1024, 1), {
      contentType: "application/pdf",
    });
    expect(await thumbs.generateThumbnail({ storage_path, mimeType: "application/pdf" })).toBeNull();
    expect(memoryStores().privateStore.objects.has(thumbs.thumbKey(storage_path))).toBe(false);
  });
});
