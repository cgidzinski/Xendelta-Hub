import { isSafeUrl } from "@shared/xennote/notes";

// Making sense of what another app shared. Apps are inconsistent: some send the address in `url`, many (Android Chrome among
// them) put it in `text`, often with a few words around it ("Check this out https://..."), and the title may repeat it.

export interface SharedInput {
  title?: string;
  text?: string;
  url?: string;
}

export interface Shared {
  /** The web address shared, when there is one (http or https only). */
  url: string | null;
  /** A name for it: the title, or the address's host. */
  title: string;
  /** Any words that came with it, without the address repeated. */
  text: string;
}

const FIRST_URL = /https?:\/\/[^\s<>"']+/i;
const trailing = /[.,;:!?)\]]+$/;

/** The host without "www.", or the text itself when it isn't an address. */
export function hostOf(address: string): string {
  try {
    return new URL(address).host.replace(/^www\./, "");
  } catch {
    return address;
  }
}

export function interpretShare(input: SharedInput): Shared {
  const title = (input.title ?? "").trim();
  const text = (input.text ?? "").trim();
  const given = (input.url ?? "").trim();

  const candidate = given || (FIRST_URL.exec(text)?.[0] ?? FIRST_URL.exec(title)?.[0] ?? "");
  const cleaned = candidate.replace(trailing, "");
  const url = cleaned && isSafeUrl(cleaned) ? cleaned : null;

  // Words that came with the address, with the address taken back out of them.
  const strip = (s: string) => (url ? s.split(candidate).join("").split(url).join("") : s).replace(/\s+/g, " ").trim();
  const words = strip(text);
  const name = strip(title) || (url ? hostOf(url) : "");
  return { url, title: name.slice(0, 200), text: words };
}

/** Which kinds of thing there are to save, for deciding what to offer. */
export function describeShare(shared: Shared, files: Array<{ type: string }>) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  return {
    hasUrl: !!shared.url,
    // A title alone is text to save only when nothing else was shared with it: with a photo it is just the photo's name.
    hasText: shared.text.length > 0 || (!shared.url && files.length === 0 && shared.title.length > 0),
    hasFiles: files.length > 0,
    hasImages: images.length > 0,
    imageCount: images.length,
  };
}
