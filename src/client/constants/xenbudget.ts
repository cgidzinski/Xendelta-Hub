// XenBudget constants shared across the client.
// Mirrors src/server/constants/xenbudget.ts — these names must match what the server
// (the rules engine and the importer) writes, because they are matched by name.

/** The system flag that marks an item off-budget: kept, but never counted in a total. */
export const FLAG_OFF_BUDGET = "Off budget";

/**
 * Derived state, not something anyone sets: the server puts it on an item exactly when
 * nothing has categorised it (withDerivedUncategorised), so the pickers leave it out and
 * the chips don't offer to remove it.
 */
export const FLAG_UNCATEGORISED = "Uncategorised";
