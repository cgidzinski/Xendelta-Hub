import type { LinkEmbed } from "@shared/chat";
import { CHAT_MAX_EMBEDS } from "@shared/chat";
import { fetchPublic } from "../utils/safeFetch";

// Previews of the links in a message. The server fetches each page (through utils/safeFetch.ts, which keeps it away
// from the server's own network and caps the time and size), reads what the page says about itself, and keeps only
// text. It never fails a send: a page that can't be reached just gets no preview.

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 240;
const SITE_MAX = 60;
const PAGE_MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 5000;

/** The web addresses in a message body (not inside code), without trailing punctuation, up to `max`, each once. */
export function extractUrls(body: string, max = CHAT_MAX_EMBEDS): string[] {
  const text = body.replace(/```[\s\S]*?```|`[^`\n]*`/g, " ");
  const found: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (url.length > 8 && !found.includes(url)) found.push(url);
    if (found.length >= max) break;
  }
  return found;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Turn HTML entities back into characters, collapse whitespace, and cut to length. */
function clean(text: string | undefined, max: number): string {
  if (!text) return "";
  const decoded = text
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
  const flat = decoded.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + "…" : flat;
}
const safeChar = (code: number) =>
  code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";

/** What a page says about itself: its Open Graph (or Twitter, or plain) title, description and site name. Null if nothing. */
export function parsePreview(html: string, pageUrl: string): LinkEmbed | null {
  const head = html.slice(0, 200_000);
  const meta = new Map<string, string>();
  // A `>` inside a quoted value doesn't end the tag.
  for (const tag of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = new Map<string, string>();
    for (const a of tag[0].matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attrs.set(a[1]!.toLowerCase(), a[2] ?? a[3] ?? "");
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const pageTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = clean(meta.get("og:title") ?? meta.get("twitter:title") ?? pageTitle, TITLE_MAX);
  const description = clean(
    meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"),
    DESCRIPTION_MAX,
  );
  if (!title && !description) return null;
  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    /* the address was already checked when it was fetched */
  }
  return {
    url: pageUrl,
    title: title || host,
    description,
    siteName: clean(meta.get("og:site_name"), SITE_MAX) || host,
  };
}

// A page seen lately isn't fetched again for a while, and one that failed isn't hammered.
const CACHE_MS = 30 * 60 * 1000;
const FAIL_MS = 5 * 60 * 1000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; value: LinkEmbed | null }>();

/** The preview for one address, or null if the page can't be reached or says nothing. Never throws. */
export async function unfurl(url: string): Promise<LinkEmbed | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < (hit.value ? CACHE_MS : FAIL_MS)) return hit.value;
  let value: LinkEmbed | null;
  try {
    const page = await fetchPublic(url, { kind: "html", maxBytes: PAGE_MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
    value = parsePreview(page.body.toString("utf8"), page.url);
  } catch {
    value = null;
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(url, { at: Date.now(), value });
  return value;
}

/** For tests: forget everything fetched so far. */
export const clearPreviewCache = () => cache.clear();
