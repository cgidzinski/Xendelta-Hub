export const ALL_CURRENCIES = ["CAD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "INR", "MXN", "BRL"];

// MUI's default Select menu grows in with a Grow/scale transition anchored to the
// center of the select — inside a Dialog this reads as the list "jumping" left/up
// as it scales in. Left-anchor the menu and disable the transition to keep it stable.
export const STABLE_CURRENCY_MENU_PROPS = {
  anchorOrigin: { vertical: "bottom", horizontal: "left" },
  transformOrigin: { vertical: "top", horizontal: "left" },
  transitionDuration: 0,
} as const;

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function getCurrencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

export function withoutCurrency(currencies: string[], excluded: string): string[] {
  return currencies.filter((c) => c !== excluded);
}

// Currency options for a group's transaction pickers: primary first, then secondaries.
// If `include` isn't already in that set, it's appended so an existing value never
// disappears from the dropdown (e.g. editing a record whose currency was later removed
// from the group's secondaries).
export function getGroupCurrencies(primary?: string, secondaries?: string[], include?: string): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  [primary || "CAD", ...(secondaries || []), ...(include ? [include] : [])].forEach((c) => {
    if (!seen.has(c)) {
      seen.add(c);
      list.push(c);
    }
  });
  return list;
}

// Accepts only digits and a single decimal separator (comma normalized to dot).
// Returns the sanitized string, or null if the keystroke should be rejected.
export function sanitizeAmount(raw: string): string | null {
  const normalized = raw.replace(/,/g, ".");
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  return normalized;
}
