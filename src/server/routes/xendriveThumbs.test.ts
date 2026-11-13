import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { Readable } from "stream";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { canThumbnail, thumbPathFor } from "../utils/xendriveThumbPaths";

// Thumbnails of image files for the drive's grid: made in the background from the original, used from then on, kept after a
// failure so nothing retries forever, and deleted with their files. Real routes, models and sharp; only storage is faked.
const { store, downloads } = vi.hoisted(() => ({ store: new Map<string, Buffer>(), downloads: [] as string[] }));
vi.mock("../config/gcs", () => ({
  privateBucket: {
    file: (path: string) => ({
      exists: async () => [store.has(path)],
      download: async () => {
        downloads.push(path);
        const buf = store.get(path);
        if (!buf) throw new Error("no such object");
        return [buf];
      },
      createReadStream: () => Readable.from([store.get(path) ?? Buffer.alloc(0)]),
      delete: async () => void store.delete(path),
    }),
  },
}));
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async (buf: Buffer, path: string) => void store.set(path, buf)),
  deleteFromGCS: vi.fn(async (path: string) => void store.delete(path)),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
}));

let t: TestApp;
let thumbnailsIdle: () => Promise<void>;
let scheduleThumbnails: typeof import("../utils/xendriveThumbs").scheduleThumbnails;
beforeAll(async () => {
  t = await startTestApp([() => import("./xendrive.js")]);
  ({ thumbnailsIdle, scheduleThumbnails } = await import("../utils/xendriveThumbs.js"));
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  store.clear();
  downloads.length = 0;
});

type U = Awaited<ReturnType<typeof createUser>>;
const auth = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const browse = (who: U, query = "") => request(t.app).get(`/api/xendrive/browse?thumbs=true${query}`).set(auth(who));
const PHOTO = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 80, b: 60 } } })
    .png()
    .toBuffer();

/** A stored file: its bytes in the bucket, its record in the database. */
const addFile = async (who: U, name: string, bytes: Buffer, extra: Record<string, unknown> = {}) => {
  const { XenDriveFile } = await import("../models/xendriveFile.js");
  const storage_path = `xendrive/${who.user._id}/${name}-stored`;
  store.set(storage_path, bytes);
  return XenDriveFile.create({
    owner_id: who.user._id,
    folder_id: null,
    name,
    storage_path,
    mimeType: "image/png",
    size: bytes.length,
    ...extra,
  });
};
const record = async (id: string) => (await import("../models/xendriveFile.js")).XenDriveFile.findById(id).lean<any>();
const urlOf = async (who: U, name: string) =>
  (await browse(who)).body.data.files.find((f: any) => f.name === name).previewUrl as string;

describe("thumbnail helpers", () => {
  it("puts a thumbnail beside its file, under thumbs/", () => {
    expect(thumbPathFor("xendrive/u1/holiday.jpg-abc")).toBe("xendrive/u1/thumbs/holiday.jpg-abc.webp");
    expect(thumbPathFor("xendrive/u1/thumbs/x")).toBe("xendrive/u1/thumbs/thumbs/x.webp");
  });
  it("makes thumbnails of pictures, but not SVG, other files, or huge ones", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/gif", "IMAGE/PNG", "image/avif"]) {
      expect(canThumbnail({ mimeType, size: 5_000 }), mimeType).toBe(true);
    }
    for (const mimeType of ["image/svg+xml", "application/pdf", "text/plain", "video/mp4"]) {
      expect(canThumbnail({ mimeType, size: 5_000 }), mimeType).toBe(false);
    }
    expect(canThumbnail({ mimeType: "image/png", size: 41 * 1024 * 1024 })).toBe(false);
    expect(canThumbnail({ mimeType: "image/png" })).toBe(true);
  });
});

describe("making and using thumbnails", () => {
  it("serves the original at first, makes a small WebP in the background, and uses it from then on", async () => {
    const me = await createUser();
    const file = await addFile(me, "photo.png", await PHOTO());
    const original = `xendrive/${me.user._id}/photo.png-stored`;

    expect(await urlOf(me, "photo.png")).toBe(`https://example.test/signed/${original}`);
    await thumbnailsIdle();

    const thumb = store.get(thumbPathFor(original));
    expect(thumb).toBeTruthy();
    const meta = await sharp(thumb!).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(360); // 1200x800 -> 360x240
    expect(thumb!.length).toBeLessThan(store.get(original)!.length);
    expect((await record(file.id)).thumbnail).toBe("ready");

    expect(await urlOf(me, "photo.png")).toBe(`https://example.test/signed/${thumbPathFor(original)}`);
    await thumbnailsIdle();
    expect(downloads).toEqual([original]); // the original was read once, to make it
  });

  it("makes each thumbnail once, however many listings ask", async () => {
    const me = await createUser();
    await addFile(me, "a.png", await PHOTO());
    await Promise.all([browse(me), browse(me), browse(me)]);
    await thumbnailsIdle();
    expect(downloads).toHaveLength(1);
  });

  it("copes with a picture it can't read: keeps using the original and doesn't try again", async () => {
    const me = await createUser();
    const bad = await addFile(me, "broken.png", Buffer.from("this is not an image"));
    const original = `xendrive/${me.user._id}/broken.png-stored`;
    await browse(me);
    await thumbnailsIdle();
    expect((await record(bad.id)).thumbnail).toBe("failed");
    expect(store.has(thumbPathFor(original))).toBe(false);
    expect(await urlOf(me, "broken.png")).toBe(`https://example.test/signed/${original}`);
    await thumbnailsIdle();
    expect(downloads).toHaveLength(1); // not retried by the second listing
  });

  it("leaves SVGs and very large pictures alone, without downloading them", async () => {
    const me = await createUser();
    const svg = await addFile(me, "logo.svg", Buffer.from("<svg/>"), { mimeType: "image/svg+xml" });
    const huge = await addFile(me, "huge.png", await PHOTO(), { size: 50 * 1024 * 1024 });
    await browse(me);
    await thumbnailsIdle();
    expect(downloads).toEqual([]);
    expect((await record(svg.id)).thumbnail).toBe("failed");
    expect((await record(huge.id)).thumbnail).toBe("failed");
  });

  it("can be asked for directly (an upload does this), and does nothing for a missing file", async () => {
    const me = await createUser();
    const file = await addFile(me, "up.png", await PHOTO());
    scheduleThumbnails([file as any]);
    await thumbnailsIdle();
    expect((await record(file.id)).thumbnail).toBe("ready");
    scheduleThumbnails([
      { _id: "507f1f77bcf86cd799439011", storage_path: "xendrive/nobody/none", mimeType: "image/png", size: 10 },
    ]);
    await thumbnailsIdle(); // the failure is swallowed
  });

  it("is used on a shared folder's page too", async () => {
    const me = await createUser();
    const folder = (await request(t.app).post("/api/xendrive/folders").set(auth(me)).send({ name: "Pics" })).body.data
      .folder;
    await addFile(me, "shared.png", await PHOTO(), { folder_id: folder._id });
    const token = (await request(t.app).post(`/api/xendrive/folders/${folder._id}/share`).set(auth(me))).body.data
      .folder.shareToken;

    await request(t.app).get(`/api/xendrive/public/folder/${token}`);
    await thumbnailsIdle();
    const view = await request(t.app).get(`/api/xendrive/public/folder/${token}`);
    expect(view.body.data.files[0].previewUrl).toContain("/thumbs/shared.png-stored.webp");
  });
});

describe("thumbnails go with their files", () => {
  const made = async (who: U, name: string, extra: Record<string, unknown> = {}) => {
    const file = await addFile(who, name, await PHOTO(), extra);
    scheduleThumbnails([file as any]);
    await thumbnailsIdle();
    const original = `xendrive/${who.user._id}/${name}-stored`;
    expect(store.has(thumbPathFor(original))).toBe(true);
    return { file, original };
  };

  it("when a file is deleted", async () => {
    const me = await createUser();
    const { file, original } = await made(me, "gone.png");
    expect((await request(t.app).delete(`/api/xendrive/files/${file.id}`).set(auth(me))).status).toBe(200);
    expect(store.has(original)).toBe(false);
    expect(store.has(thumbPathFor(original))).toBe(false);
  });

  it("when a folder and everything in it is deleted", async () => {
    const me = await createUser();
    const folder = (await request(t.app).post("/api/xendrive/folders").set(auth(me)).send({ name: "Old" })).body.data
      .folder;
    const { original } = await made(me, "inside.png", { folder_id: folder._id });
    expect((await request(t.app).delete(`/api/xendrive/folders/${folder._id}`).set(auth(me))).status).toBe(200);
    expect(store.has(original)).toBe(false);
    expect(store.has(thumbPathFor(original))).toBe(false);
  });

  it("when an app removes the photos it stored", async () => {
    const me = await createUser();
    const { file, original } = await made(me, "app.png", { source: { app: "xennote", ref: "r1" }, counted: false });
    const { removeAppFiles } = await import("../utils/appFiles.js");
    await removeAppFiles([file.id]);
    expect(store.has(original)).toBe(false);
    expect(store.has(thumbPathFor(original))).toBe(false);
  });
});
