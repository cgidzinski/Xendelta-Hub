// XenBudget-specific constants.

/**
 * Flags every book is guaranteed to have.
 *
 * The importer and the rules engine reference these by name, so they must exist in every
 * book — which is why the API refuses to delete or rename one. Colours stay editable;
 * they are cosmetic. See ensureSystemLabels() in routes/xenbudget.ts.
 */
// The four colours are chosen to read as clearly distinct from each other at a glance
// (red / blue / amber / grey); they may coincide with category colours, which is fine.
export const SYSTEM_FLAGS: { name: string; color: string }[] = [
  { name: "Needs review", color: "#e66767" },        // a human should look at this
  { name: "Uncategorised", color: "#3987e5" },       // imported, but nothing categorised it
  { name: "Possible duplicate", color: "#c98500" },  // matched an existing row, imported anyway
  { name: "Ignored", color: "#8b8b85" },             // deliberately set aside
  { name: "Off budget", color: "#64748b" },          // stored, but never counted in a total
];

/** The system flag the importer puts on a row no rule managed to categorise. */
export const FLAG_UNCATEGORISED = "Uncategorised";
/** The system flag the importer puts on a row that matched something already in the book. */
export const FLAG_POSSIBLE_DUPLICATE = "Possible duplicate";
/** The generic "a human should look at this" flag; what a rule's old flag action became. */
export const FLAG_NEEDS_REVIEW = "Needs review";
/** Deliberately set aside — Review mode skips these even if they're also uncategorised. */
export const FLAG_IGNORED = "Ignored";
/** Stored, but never counted in a total — what a rule's "exclude" disposition became. */
export const FLAG_OFF_BUDGET = "Off budget";

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
  { name: "Health", color: "#d55181" },
  { name: "Entertainment", color: "#e66767" },
  { name: "Alcohol", color: "#ef4444" },
  { name: "Bills", color: "#06b6d4" },
  { name: "Car Maintenance", color: "#7e22ce" },
  { name: "Eating Out", color: "#b45309" },
  { name: "Entertainment & Experiences", color: "#be185d" },
  { name: "Gas", color: "#16a34a" },
  { name: "Gifts", color: "#ea580c" },
  { name: "Hobbies", color: "#4f46e5" },
  { name: "House Needs", color: "#84cc16" },
  { name: "House Wants", color: "#0e7490" },
  { name: "Medical Expenses", color: "#e11d48" },
  { name: "Personal Care", color: "#c026d3" },
  { name: "Pet Care", color: "#059669" },
  { name: "Travel", color: "#92400e" },
  { name: "Savings", color: "#10b981" },
  // Where a savings goal's contributions land by default (see GoalForm). Kept apart from
  // "Savings" so a monthly savings-minimum budget on that category measures the standing
  // commitment on its own - putting both here would let an opportunistic top-up to a goal
  // silently satisfy the every-month floor. A book that WANTS them counted together just
  // lists both categories on the budget.
  { name: "Savings Goals", color: "#14b8a6" },
  { name: "Payment", color: "#6366f1" },
  { name: "Income", color: "#22c55e" },
  { name: "Exchange", color: "#f59e0b" },
  { name: "Other", color: "#8b8b85" },
];
