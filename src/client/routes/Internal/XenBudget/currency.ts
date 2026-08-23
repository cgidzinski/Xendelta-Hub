// XenBudget-local currency formatting.
//
// XenBudget shows amounts with just the currency symbol ($, ¥, €, £, ₹, R$ …),
// rather than the letter-coded prefix that `Intl.NumberFormat`'s default "symbol"
// display emits (CA$, US$, A$ …). Xensplit keeps the shared `formatCurrency` /
// `getCurrencySymbol` from utils/currencyUtils unchanged, so this module is
// deliberately scoped to XenBudget only.
export function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
    }).format(amount);
}

export function getCurrencySymbol(currency: string): string {
    return (
        new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
            .formatToParts(0)
            .find((p) => p.type === "currency")?.value ?? currency
    );
}
