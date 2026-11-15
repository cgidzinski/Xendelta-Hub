import { privateStore } from "../storage";

/**
 * The first slice of a text-like file, for the in-page preview (docs/storage.md). Reading from the server means there is
 * no R2 CORS setup to do; the client shows the text, or rendered Markdown, or a CSV table.
 */

export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;

const TEXT_LIKE = /^(text\/)|(application\/(json|xml|javascript))|(csv|markdown)/i;

/** Whether the browser can show this kind as text (rather than its icon). */
export const isTextPreviewable = (mimeType: string): boolean => TEXT_LIKE.test(mimeType);

/** The first ~256 KB of a stored file, as UTF-8, stopping the read early once the cap is reached. */
export async function readTextPreview(storagePath: string): Promise<{ text: string; truncated: boolean }> {
  const stream = await privateStore.read(storagePath);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (total >= TEXT_PREVIEW_MAX_BYTES) break;
    const take = Math.min(buf.length, TEXT_PREVIEW_MAX_BYTES - total);
    chunks.push(take === buf.length ? buf : buf.subarray(0, take));
    total += take;
  }
  stream.destroy?.(); // stop reading the rest of the file
  return { text: Buffer.concat(chunks).toString("utf8"), truncated: total >= TEXT_PREVIEW_MAX_BYTES };
}
