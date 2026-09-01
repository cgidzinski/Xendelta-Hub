// Recipaint stores one URL per image - the original upload. The thumbnail that the cards
// and dense galleries render lives at a path derived from it, so both sides can compute it
// without a second field on the recipe. Client and server must agree exactly, hence shared.

export const RECIPAINT_ASSET_FOLDER = "recipaint-assets";
export const RECIPAINT_THUMB_FOLDER = `${RECIPAINT_ASSET_FOLDER}/thumbs`;

/** Thumbnails are always webp, whatever the original was. */
export const RECIPAINT_THUMB_EXTENSION = "webp";
export const RECIPAINT_THUMB_MAX_EDGE = 400;

const stripExtension = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
};

/** "photo-1-2.jpg" -> "photo-1-2.webp" */
export function thumbFilenameFor(filename: string): string {
  return `${stripExtension(filename)}.${RECIPAINT_THUMB_EXTENSION}`;
}

/** The GCS object path for an original's thumbnail. */
export function thumbGcsPathFor(filename: string): string {
  return `${RECIPAINT_THUMB_FOLDER}/${thumbFilenameFor(filename)}`;
}

/** Last path segment of a stored asset URL, or "" if there isn't one. */
export function filenameFromAssetUrl(assetUrl: string): string {
  const withoutQuery = assetUrl.split(/[?#]/)[0];
  return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
}

/**
 * Map a stored original URL to its thumbnail URL.
 *
 * Returns the input unchanged for anything that isn't a recipaint asset URL - a blank
 * value, or a URL already pointing at the thumbs folder - so callers can apply it blindly.
 */
export function thumbUrlFor(assetUrl: string | undefined | null): string {
  if (!assetUrl) return "";
  if (assetUrl.includes(`/${RECIPAINT_THUMB_FOLDER}/`)) return assetUrl;

  const marker = `/${RECIPAINT_ASSET_FOLDER}/`;
  const at = assetUrl.lastIndexOf(marker);
  if (at === -1) return assetUrl;

  const prefix = assetUrl.slice(0, at + marker.length);
  const filename = filenameFromAssetUrl(assetUrl);
  if (!filename) return assetUrl;

  return `${prefix}thumbs/${thumbFilenameFor(filename)}`;
}

/**
 * Upload ceiling, enforced by multer server-side. Shared so the client can reject an
 * oversized file with a useful message instead of round-tripping it for a 500.
 */
export const MAX_RECIPAINT_ASSET_SIZE = 10 * 1024 * 1024; // 10MB
