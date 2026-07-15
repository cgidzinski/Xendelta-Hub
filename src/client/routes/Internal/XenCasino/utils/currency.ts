// Cheddar is always shown as a whole number with thousands separators, never with
// decimals - account balances come back as a Numeric(28, 10) string (e.g.
// "950.0000000000"); jackpot pools and win amounts come back as plain numbers. Either way
// this is the one formatting rule used everywhere a cheddar amount renders.
export function formatCheddar(amount: string | number | null): string {
    if (amount === null) {
        return "—";
    }
    const value = typeof amount === "number" ? amount : Number(amount);
    return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
}
