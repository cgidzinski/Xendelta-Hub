// GIF search through GIPHY, for the picker. The server asks (the API key never leaves it), keeps what it learned for a few
// minutes so a busy chat doesn't spend the quota, and passes on only the fields the picker needs. The host is fixed, so
// nothing here can be pointed at another address.
import { AppError } from "../utils/http";
import { GIF_PAGE, isGifHost, type ChatGif } from "@shared/gif";

const API = "https://api.giphy.com/v1/gifs";
const CACHE_MS = 5 * 60_000;
const CACHE_MAX = 200;

export const gifsEnabled = () => !!process.env.GIPHY_API_KEY;

interface Page {
  gifs: ChatGif[];
  /** Where the next page starts, or null when there is no more. */
  next: number | null;
}
const cache = new Map<string, { at: number; page: Page }>();

/** For tests. */
export const clearGifCache = () => cache.clear();

interface GiphyImage {
  url?: string;
  width?: string;
  height?: string;
}
interface GiphyItem {
  title?: string;
  images?: { fixed_height?: GiphyImage; fixed_height_still?: GiphyImage };
}

function normalize(item: GiphyItem): ChatGif | null {
  const moving = item.images?.fixed_height;
  const still = item.images?.fixed_height_still;
  const width = Number(moving?.width);
  const height = Number(moving?.height);
  if (!moving?.url || !still?.url || !isGifHost(moving.url) || !isGifHost(still.url)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return { url: moving.url, stillUrl: still.url, width, height, title: (item.title ?? "").slice(0, 120) };
}

/** Search (or, with no words, what is trending). `offset` pages through the results. */
export async function findGifs(q: string, offset: number): Promise<Page> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new AppError(503, "GIFs aren't set up here");
  const cacheKey = `${q}\u0000${offset}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.page;

  const url = new URL(q ? `${API}/search` : `${API}/trending`);
  url.searchParams.set("api_key", key);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("limit", String(GIF_PAGE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("rating", "pg");
  url.searchParams.set("bundle", "messaging_non_clips");

  let body: { data?: GiphyItem[]; pagination?: { total_count?: number; count?: number } };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GIPHY answered ${res.status}`);
    body = (await res.json()) as typeof body;
  } catch (e) {
    // The message names no URL: the address carries the key.
    console.error("GIF search failed:", e instanceof Error ? e.message.replace(key, "…") : "error");
    throw new AppError(502, "GIFs aren't available right now. Try again in a moment.");
  }

  const gifs = (body.data ?? []).map(normalize).filter((g): g is ChatGif => g !== null);
  const total = body.pagination?.total_count ?? 0;
  const advanced = offset + (body.pagination?.count ?? (body.data ?? []).length);
  const page: Page = { gifs, next: advanced < total && (body.data ?? []).length > 0 ? advanced : null };

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { at: Date.now(), page });
  return page;
}
