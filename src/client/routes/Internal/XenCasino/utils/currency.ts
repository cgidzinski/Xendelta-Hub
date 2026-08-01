// Cheddar is always shown as a whole number with thousands separators, never with
// decimals - account balances come back as a Numeric(28, 10) string (e.g.
// "950.0000000000"); jackpot pools and win amounts come back as plain numbers. Large
// amounts (≥1K) use compact notation (e.g. "123.34K", "2.45M") so the balance chip
// and game UIs stay readable without reflow on big numbers.
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
    return value < 1000
        ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : compactFormatter.format(value);
}
