import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";

// Passwords on XenDrive share links. Stored as bcrypt hashes (a leaked database or an owner's screen no longer shows
// them); a person can set or remove one but never read it back.
const COST = 10;

export const hashSharePassword = (plain: string): Promise<string> => bcrypt.hash(plain, COST);

/**
 * Does `attempt` match? `hash` is the stored bcrypt hash. `legacyPlain` is the old plain-text value from before
 * migrations/1794900000000-xendrive-password-hash.ts; it is only still there in the moments between a deploy and that
 * migration, and is compared in constant time.
 */
export async function checkSharePassword(
  attempt: string,
  stored: { hash?: string | null; legacyPlain?: string | null },
): Promise<boolean> {
  if (stored.hash) return bcrypt.compare(attempt, stored.hash);
  if (stored.legacyPlain) {
    const a = Buffer.from(attempt);
    const b = Buffer.from(stored.legacyPlain);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return true; // no password set
}

export const isUnset = (value: unknown) => value === "" || value === null;
