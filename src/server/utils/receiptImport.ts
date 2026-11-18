import { roundMoney } from "@shared/money";

/** A receipt as read from a photo: what a person reviews and fixes before splitting it. Amounts are in dollars. */
export interface ImportedReceipt {
  merchant: string;
  /** YYYY-MM-DD, or "" when the photo has no readable date. */
  date: string;
  /** A 3-letter code, or "" when the receipt doesn't show one. */
  currency: string;
  items: { name: string; amount: number }[];
  tax: number;
  tip: number;
  total: number;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** "$1,234.50", "12.99", "(3.00)" or a plain number as a rounded amount; 0 when there is none. */
export function parseAmount(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? roundMoney(v) : 0;
  const raw = text(v);
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  // A lone comma is a decimal comma ("12,99"); otherwise commas are thousands separators.
  const digits = raw.replace(/[^\d.,]/g, "");
  const normal = /^\d+,\d{1,2}$/.test(digits) ? digits.replace(",", ".") : digits.replace(/,/g, "");
  const n = Number(normal);
  if (!Number.isFinite(n)) return 0;
  return roundMoney(negative ? -n : n);
}

// Lines that are the bill's own arithmetic, not something bought.
const NOT_AN_ITEM =
  /^(sub\s*-?\s*total|total|tax|gst|hst|pst|vat|tip|gratuity|change|balance|amount due|cash|visa|debit)\b/i;

/** The fields the model gave as a receipt, or null when it found no purchased lines. */
export function receiptFromParts(parts: Record<string, unknown> | null): ImportedReceipt | null {
  if (!parts) return null;
  const rawItems = Array.isArray(parts.items) ? parts.items : [];
  const items = rawItems
    .map((i) => {
      const row = (i ?? {}) as Record<string, unknown>;
      return { name: text(row.name), amount: parseAmount(row.amount) };
    })
    .filter((i) => i.name && i.amount !== 0 && !NOT_AN_ITEM.test(i.name));
  if (items.length === 0) return null;

  const date = text(parts.date);
  const currency = text(parts.currency).toUpperCase();
  const tax = parseAmount(parts.tax);
  const tip = parseAmount(parts.tip);
  const itemsSum = roundMoney(items.reduce((sum, i) => sum + i.amount, 0));
  return {
    merchant: text(parts.merchant),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
    items,
    tax,
    tip,
    // A misread total is worse than none: fall back to what the lines add up to.
    total: parseAmount(parts.total) || roundMoney(itemsSum + tax + tip),
  };
}
