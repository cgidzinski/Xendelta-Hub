import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { privateStore } from "../storage";
import { FileRecord } from "../models/fileRecord";
import { generateSignedUrl } from "./storageUtils";

/**
 * XenDrive thumbnails and posters (docs/storage.md): a small WebP beside the original in the private bucket, made in the
 * background after an upload. Images use sharp (the recipe Recipaint uses). Videos and PDFs get a poster through ffmpeg
 * / poppler, when those system binaries are installed (docs/home-server-setup.md). A thumbnail is a few KB, so its bytes
 * are a house cost, never added to the file owner's bill. The original stays untouched - the lightbox still shows it.
 */

export const XENDRIVE_THUMB_MAX_EDGE = 320;
const THUMB_CACHE_CONTROL = "private, max-age=21600"; // 6 h: the link is stable for one 6 h window
const THUMB_URL_WINDOW_MS = 6 * 60 * 60 * 1000;
const THUMB_URL_TTL_MINUTES = 12 * 60;
const VIDEO_FRAME_MAX_BYTES = 50 * 1024 * 1024;
const PDF_POSTER_MAX_BYTES = 20 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 60 * 1000;

/** Run a child process with no shell, a timeout and a bounded stdout, as a promise. */
function runCommand(
  bin: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { ...options, windowsHide: true }, (error, stdout: Buffer | string, stderr: string) => {
      if (error) reject(error);
      else resolve({ stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout), stderr });
    });
  });
}

/** A thumbnail's object key. Derived from the original's key, so it is immutable per file and safe to cache. */
export const thumbKey = (storagePath: string) => `thumbs/${storagePath}.webp`;

/** What gets a thumbnail/poster when the file is stored. Images always; videos and PDFs when their binary is there. */
export const thumbStatusFor = (mimeType: string): "pending" | "none" => {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/") || mime.startsWith("video/") || mime === "application/pdf") return "pending";
  return "none";
};

// Found once, then remembered for the process: a missing binary (Windows dev, CI) skips that kind of poster.
const binaryPresent = new Map<string, boolean>();

async function hasBinary(bin: string): Promise<boolean> {
  const known = binaryPresent.get(bin);
  if (known !== undefined) return known;
  try {
    await runCommand(bin, ["-version"], { timeout: 5000, maxBuffer: 1024 * 1024 });
    binaryPresent.set(bin, true);
  } catch {
    binaryPresent.set(bin, false);
  }
  return binaryPresent.get(bin)!;
}

async function readBuffer(key: string): Promise<Buffer> {
  const stream = await privateStore.read(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Resize a frame, encode as WebP and store it under a key. */
async function storeRendition(
  source: sharp.Sharp,
  key: string,
  maxEdge: number,
): Promise<{ path: string; width: number; height: number }> {
  const out = await source
    .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  await privateStore.put(key, out.data, { contentType: "image/webp", cacheControl: THUMB_CACHE_CONTROL });
  return { path: key, width: out.info.width, height: out.info.height };
}

const storePoster = (storagePath: string, source: sharp.Sharp) =>
  storeRendition(source, thumbKey(storagePath), XENDRIVE_THUMB_MAX_EDGE);

/** One frame from a video, fetched directly from R2 by ffmpeg (it reads only the bytes it needs). */
async function generateVideoPoster(storagePath: string) {
  if (!(await hasBinary("ffmpeg"))) return null;
  const url = await generateSignedUrl(storagePath, 15);
  const { stdout } = await runCommand(
    "ffmpeg",
    ["-ss", "1", "-i", url, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"],
    { timeout: COMMAND_TIMEOUT_MS, maxBuffer: VIDEO_FRAME_MAX_BYTES },
  );
  return storePoster(storagePath, sharp(stdout));
}

/** Page 1 of a PDF, rendered by poppler from a temp copy. Large PDFs skip the poster. */
async function generatePdfPoster(storagePath: string) {
  if (!(await hasBinary("pdftoppm"))) return null;
  const info = await privateStore.head(storagePath);
  if (!info || info.size > PDF_POSTER_MAX_BYTES) return null;

  const pdf = await readBuffer(storagePath);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "xendrive-poster-"));
  try {
    const input = path.join(dir, "input.pdf");
    await fs.writeFile(input, pdf);
    const prefix = path.join(dir, "page");
    await runCommand("pdftoppm", ["-f", "1", "-l", "1", "-png", "-r", "72", input, prefix], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    const frame = await fs.readFile(`${prefix}-1.png`);
    return storePoster(storagePath, sharp(frame));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The bigger rendition the file page shows instead of the original (docs/storage.md). */
export const previewKey = (storagePath: string) => `previews/${storagePath}.webp`;
export const XENDRIVE_PREVIEW_MAX_EDGE = 1600;

/** Make the ~320 px WebP (thumbnail or poster) beside the original. Images also get the ~1600 px preview rendition. */
export async function generateThumbnail(file: {
  storage_path: string;
  mimeType: string;
}): Promise<{ path: string; width: number; height: number } | null> {
  const mime = file.mimeType.toLowerCase();
  if (mime.startsWith("image/")) {
    const original = await readBuffer(file.storage_path);
    const oriented = sharp(original).rotate(); // honour EXIF orientation
    const thumb = await storePoster(file.storage_path, oriented.clone());
    // The file page shows this bigger rendition; the original opens on demand. A failure here keeps the thumbnail.
    await storeRendition(oriented, previewKey(file.storage_path), XENDRIVE_PREVIEW_MAX_EDGE).catch((e) =>
      console.error(`>>> Preview rendition failed for XenDrive file ${file.storage_path}:`, e),
    );
    return thumb;
  }
  if (mime.startsWith("video/")) return generateVideoPoster(file.storage_path);
  if (mime === "application/pdf") return generatePdfPoster(file.storage_path);
  return null;
}

/** A cacheable link: fixed to the start of a 6 h window, valid for 12 h, so listings return the same URL and the browser caches it. */
export async function thumbnailUrlFor(storagePath: string): Promise<string> {
  const windowStart = new Date(Math.floor(Date.now() / THUMB_URL_WINDOW_MS) * THUMB_URL_WINDOW_MS);
  return generateSignedUrl(thumbKey(storagePath), THUMB_URL_TTL_MINUTES, { signingDate: windowStart });
}

/** A cacheable link to the bigger preview rendition (same windowing as the thumbnail). */
export async function previewUrlFor(storagePath: string): Promise<string> {
  const windowStart = new Date(Math.floor(Date.now() / THUMB_URL_WINDOW_MS) * THUMB_URL_WINDOW_MS);
  return generateSignedUrl(previewKey(storagePath), THUMB_URL_TTL_MINUTES, { signingDate: windowStart });
}

/** Remove a file's thumbnail and preview rendition; missing ones are not errors. */
export async function deleteThumbnail(storagePath: string): Promise<void> {
  await Promise.allSettled([
    privateStore.delete(thumbKey(storagePath)),
    privateStore.delete(previewKey(storagePath)),
  ]).catch(() => undefined);
}

/**
 * Work through files waiting for a thumbnail, in batches. Resumable by design: a file stays `pending` until its
 * thumbnail is stored, and a crash between generating and saving the record simply regenerates (idempotent). Used by the
 * scheduler and by `npm run storage:thumbs`. The status and the thumbnail live on the file's record.
 */
export async function processPendingThumbnails(batchSize = 20): Promise<number> {
  const pending = await FileRecord.find({ bucket: "private", thumbStatus: "pending" }).limit(batchSize).lean();
  for (const file of pending) {
    try {
      const thumb = await generateThumbnail({ storage_path: file.key, mimeType: file.mimeType });
      await FileRecord.updateOne(
        { _id: file._id },
        thumb
          ? {
              $set: {
                thumbKey: thumb.path,
                thumbWidth: thumb.width,
                thumbHeight: thumb.height,
                thumbStatus: "ready",
                ...(file.mimeType.toLowerCase().startsWith("image/") ? { previewKey: previewKey(file.key) } : {}),
              },
            }
          : { $set: { thumbStatus: "none" } },
      );
    } catch (e) {
      // The upload stays healthy; the file just shows its icon.
      console.error(`>>> Thumbnail generation failed for file ${file._id}:`, e);
      await FileRecord.updateOne({ _id: file._id }, { $set: { thumbStatus: "failed" } });
    }
  }
  return pending.length;
}
