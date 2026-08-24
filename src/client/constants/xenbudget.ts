// XenBudget constants shared across the client.
// Mirrors src/server/constants/xenbudget.ts — these names must match what the server
// (the rules engine and the importer) writes, because they are matched by name.

/** The system flag that marks an item off-budget: kept, but never counted in a total. */
export const FLAG_OFF_BUDGET = "Off budget";
