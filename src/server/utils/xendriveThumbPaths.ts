import { deleteFromGCS } from "./gcsUtils";

// Where thumbnails of image and PDF files live and which files get one. Kept apart from the maker (utils/xendriveThumbs.ts) so the
// file model and the delete paths can use it without importing the model back.

export const THUMB_EDGE = 360;
/** Larger originals aren't thumbnailed (reading a huge image into memory isn't worth a thumbnail). */
export const THUMB_MAX_BYTES = 40 * 1024 * 1024;

/** A PDF is read whole and drawn, which costs more than resizing a photo, so the limit is lower. */
export const PDF_THUMB_MAX_BYTES = 25 * 1024 * 1024;

export const isPdf = (mimeType: string) => mimeType.toLowerCase() === "application/pdf";

/** Where a file's thumbnail lives: beside it, under thumbs/, always WebP. */
export const thumbPathFor = (storagePath: string) =>
  storagePath.replace(/^(xendrive\/[^/]+)\//, "$1/thumbs/") + ".webp";

/** Is this something a thumbnail can be made of? Pictures (not SVG, which isn't a bitmap) and PDFs, if not too large. */
export const canThumbnail = (file: { mimeType: string; size?: number | null }) =>
  isPdf(file.mimeType)
    ? (file.size ?? 0) <= PDF_THUMB_MAX_BYTES
    : /^image\/(jpeg|jpg|png|webp|gif|avif|tiff|bmp)$/i.test(file.mimeType) && (file.size ?? 0) <= THUMB_MAX_BYTES;

/** Delete the thumbnails of these stored files (when the files go). Never throws: a missing thumbnail is the usual case. */
export async function removeThumbnails(storagePaths: string[]): Promise<void> {
  await Promise.all(storagePaths.map((p) => deleteFromGCS(thumbPathFor(p), true).catch(() => undefined)));
}
