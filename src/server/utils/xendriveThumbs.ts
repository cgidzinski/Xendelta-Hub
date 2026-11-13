import sharp from "sharp";
import { privateBucket } from "../config/gcs";
import { XenDriveFile } from "../models/xendriveFile";
import { uploadToGCS } from "./gcsUtils";
import { THUMB_EDGE, canThumbnail, isPdf, thumbPathFor } from "./xendriveThumbPaths";
import { renderPdfFirstPage } from "./pdfThumb";

// Small pictures of image files and the first page of PDFs, for the drive's grid. The grid used to show every image at full size (a folder of phone
// photos meant dozens of multi-megabyte downloads). A thumbnail is made once, in the background, and kept next to the file
// in the private bucket under `xendrive/<user>/thumbs/`. Until it exists (or if it can't be made) the grid just uses the
// original, so nothing ever waits on one.

const CONCURRENCY = 2;

type ThumbJob = { _id: unknown; storage_path: string; mimeType: string; size?: number | null };

async function make(file: ThumbJob): Promise<void> {
  const id = String(file._id);
  try {
    const [original] = await privateBucket.file(file.storage_path).download();
    // A PDF's thumbnail is its first page; everything else is the picture itself.
    const bitmap = isPdf(file.mimeType) ? await renderPdfFirstPage(original) : original;
    const thumb = await sharp(bitmap)
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    await uploadToGCS(thumb, thumbPathFor(file.storage_path), "image/webp", true, "private, max-age=3600");
    await XenDriveFile.updateOne({ _id: id }, { $set: { thumbnail: "ready" } });
  } catch {
    // Unreadable or too odd: remember, so every listing doesn't try again. The grid keeps using the original.
    await XenDriveFile.updateOne({ _id: id }, { $set: { thumbnail: "failed" } }).catch(() => undefined);
  }
}

// A small in-process queue: a couple at a time, each file at most once, and nothing that can hold up a request.
const queued = new Set<string>();
const waiting: ThumbJob[] = [];
let running = 0;
let idle: Array<() => void> = [];

function pump() {
  while (running < CONCURRENCY && waiting.length > 0) {
    const job = waiting.shift()!;
    running++;
    void make(job).finally(() => {
      running--;
      queued.delete(String(job._id));
      pump();
    });
  }
  if (running === 0 && waiting.length === 0) {
    const done = idle;
    idle = [];
    done.forEach((resolve) => resolve());
  }
}

/** Make thumbnails for these files in the background. Files that can't have one (not a picture, too big) are marked so. */
export function scheduleThumbnails(files: ThumbJob[]): void {
  for (const file of files) {
    const id = String(file._id);
    if (queued.has(id)) continue;
    if (!canThumbnail(file)) {
      void XenDriveFile.updateOne({ _id: id }, { $set: { thumbnail: "failed" } }).catch(() => undefined);
      continue;
    }
    queued.add(id);
    waiting.push(file);
  }
  pump();
}

/** Resolves when the queue is empty. For tests. */
export const thumbnailsIdle = () =>
  running === 0 && waiting.length === 0 ? Promise.resolve() : new Promise<void>((resolve) => idle.push(resolve));
