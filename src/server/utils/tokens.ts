import crypto from "crypto";

/** URL-safe random token from the OS CSPRNG. Use for share links, invites, reset links. */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** One-way hash for tokens that are stored (reset links): a leaked DB then can't be replayed. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
