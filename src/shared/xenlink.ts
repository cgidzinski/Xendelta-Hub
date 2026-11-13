// XenLink vocabulary shared by the server (validation, redirect) and the client (the redirect page, the form).

/** A custom short name: lowercase letters, digits, "-" and "_", 3 to 40 characters, starting with a letter or digit. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{2,39}$/;

/** How many days of clicks the link's chart shows (and how long the per-day counts are kept). */
export const STATS_DAYS = 30;

// Something that starts like "scheme:". A host with a port ("localhost:3000/x", "example.com:8080") looks like one, so a
// colon followed by digits (and then a "/", "?", "#" or the end) is not treated as a scheme.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i;

/** Spaces, line breaks and other control characters never belong in an address. */
const hasWhitespaceOrControl = (text: string) =>
  /\s/.test(text) || [...text].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

/**
 * The address a link opens, or null if it can't be made into a web address. People paste "example.com", so a missing
 * scheme becomes https://. Anything with another scheme (javascript:, data:, file:, mailto:...) is refused: following
 * one from this app's own page would run it here. A valid address is returned as it was written.
 */
export function normalizeDestination(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text || text.length > 2048 || hasWhitespaceOrControl(text)) return null;
  // An address that already has its scheme is kept exactly as written; only a missing one is filled in.
  const hasScheme = HAS_SCHEME.test(text);
  const full = hasScheme ? text : `https://${text.replace(/^\/\//, "")}`;
  try {
    const url = new URL(full);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.username || url.password) return null;
    return full;
  } catch {
    return null;
  }
}
