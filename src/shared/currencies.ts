// The currencies XenSplit and XenBudget offer. Lives in shared/ so the server can
// validate against the same list the client's dropdowns are built from.
export const ALL_CURRENCIES = ["CAD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "INR", "MXN", "BRL"] as const;

export type Currency = (typeof ALL_CURRENCIES)[number];

/** What a currency picker starts on when the user hasn't chosen one. */
export const DEFAULT_CURRENCY = "CAD";
