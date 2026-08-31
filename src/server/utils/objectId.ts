// Ownership checks compare two ids that reach the handler in different shapes: `req.user._id`
// is a mongoose ObjectId (the JWT strategy loads a full document), a document's ref field is
// an ObjectId, a populated ref is a whole document, and anything off the wire is a string.
//
// Comparing those with === / !== silently does the wrong thing - a hex string is never equal
// to the ObjectId it came from - which is exactly how DELETE /api/recipaint/:id came to deny
// its own owner. Normalise, then compare.

/**
 * The 24-hex form of an id, or null if the value isn't one.
 *
 * Accepts an ObjectId, a hex string, or a populated ref (an object carrying `_id`).
 * Deliberately total: `new ObjectId(x)` throws a BSONError on junk, and an ownership check
 * is the wrong place to turn bad input into a 500.
 */
function toHexId(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  // A populated ref is a document, not an id - reach through to the id it carries.
  const raw =
    typeof value === "object" && value !== null && "_id" in (value as Record<string, unknown>)
      ? (value as Record<string, unknown>)._id
      : value;

  if (raw === null || raw === undefined) return null;

  const asString = typeof raw === "string" ? raw : String(raw);
  return /^[a-f0-9]{24}$/i.test(asString) ? asString.toLowerCase() : null;
}

/**
 * Do two id-ish values refer to the same document?
 *
 * False whenever either side isn't a usable id, so a missing or malformed value can never
 * be read as a match.
 */
export function isSameId(a: unknown, b: unknown): boolean {
  const left = toHexId(a);
  if (left === null) return false;
  return left === toHexId(b);
}
