// Cheddar is always shown as a whole number with thousands separators, never with
// decimals - account balances come back as a Numeric(28, 10) string (e.g.
// "950.0000000000"); jackpot pools and win amounts come back as plain numbers. Only
// 5-digit-and-up amounts (≥10,000) use compact notation (e.g. "12.34K", "2.45M") - anything
// under that stays as a full number, since 4 digits is still perfectly readable and
// shortening it just loses precision for no reason. Every amount is prefixed with the 🧀
// icon so callers never need to add their own - "—" (no value) intentionally has no icon.
const compactFormatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
});

export function formatCheddar(amount: string | number | null): string {
    if (amount === null) {
        return "—";
    }
    const value = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(value)) return "—";
    const formatted = value < 10000
        ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : compactFormatter.format(value);
    return `🧀 ${formatted}`;
}
