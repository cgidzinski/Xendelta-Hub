// An Interac e-transfer is addressed to either an email or a phone number, so the
// profile keeps one free-form handle and this decides which shape it is. Shared so
// the profile form and the zod schema behind it can't drift apart.

export const ETRANSFER_MAX = 255;

/** Where to send someone an e-transfer, and what currency their handle accepts. */
export interface EtransferInfo {
  handle: string;
  currency: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Punctuation people actually type into a phone number; everything left must be digits.
const PHONE_PUNCTUATION_RE = /[\s()+.-]/g;

export function isEtransferEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isEtransferPhone(value: string): boolean {
  const digits = value.trim().replace(PHONE_PUNCTUATION_RE, "");
  return /^\d{10,15}$/.test(digits);
}

export function isValidEtransfer(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ETRANSFER_MAX) return false;
  return isEtransferEmail(trimmed) || isEtransferPhone(trimmed);
}

/** Emails are case-insensitive, so store them lowercased; phone numbers keep the user's formatting. */
export function normalizeEtransfer(value: string): string {
  const trimmed = value.trim();
  return isEtransferEmail(trimmed) ? trimmed.toLowerCase() : trimmed;
}
