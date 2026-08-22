// XenBudget-specific constants.

/**
 * Flags every book is guaranteed to have.
 *
 * The importer and the rules engine reference these by name, so they must exist in every
 * book — which is why the API refuses to delete or rename one. Colours stay editable;
 * they are cosmetic. See ensureSystemLabels() in routes/xenbudget.ts.
 */
export const SYSTEM_FLAGS: { name: string; color: string }[] = [
  { name: "Needs review", color: "#c98500" },        // a human should look at this
  { name: "Uncategorised", color: "#d95926" },       // imported, but nothing categorised it
  { name: "Possible duplicate", color: "#d55181" },  // matched an existing row, imported anyway
  { name: "Ignored", color: "#8b8b85" },             // deliberately set aside
];

/** The system flag the importer puts on a row no rule managed to categorise. */
export const FLAG_UNCATEGORISED = "Uncategorised";
/** The system flag the importer puts on a row that matched something already in the book. */
export const FLAG_POSSIBLE_DUPLICATE = "Possible duplicate";
/** The generic "a human should look at this" flag; what a rule's old flag action became. */
export const FLAG_NEEDS_REVIEW = "Needs review";

export function isSystemFlag(name: string): boolean {
  return SYSTEM_FLAGS.some((t) => t.name.toLowerCase() === (name || "").toLowerCase());
}

/**
 * Seeded into a new book so budgets and imports have something to work with on day one.
 * Ordinary categories with no special status — nothing in the code depends on them
 * existing, so they are freely renamed and deleted.
 */
export const STARTER_CATEGORIES: { name: string; color: string }[] = [
  { name: "Groceries", color: "#199e70" },
  { name: "Rent", color: "#3987e5" },
  { name: "Transport", color: "#d95926" },
  { name: "Dining", color: "#c98500" },
  { name: "Utilities", color: "#9085e9" },
  { name: "Health", color: "#d55181" },
  { name: "Entertainment", color: "#e66767" },
  { name: "Other", color: "#8b8b85" },
];
