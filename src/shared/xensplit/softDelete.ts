// Soft deletion for XenSplit ledger records.
//
// Expenses, settlements and exchanges are never removed from the group document -
// deleting one only stamps `deleted_at`, so the row can be shown and restored later.
// That makes the *read* paths the delicate part: a deleted record that still reaches
// the balance engine silently rewrites everyone's balances. Both sides therefore share
// this one predicate rather than each open-coding a truthiness check.
//
// Imported by both the client and the server, so it stays resolution-agnostic: ESM
// syntax only, no Node or DOM APIs, no mongoose - the same constraint balances.ts
// documents in its header.

export interface SoftDeletable {
  /** Date on the server, an ISO string once serialized to the client; null/absent means live. */
  deleted_at?: Date | string | null;
  deleted_by?: string;
}

/** Records written before soft deletion existed have no field at all, which reads as live. */
export function isDeleted(row: SoftDeletable): boolean {
  return row.deleted_at !== null && row.deleted_at !== undefined;
}

export function liveOnly<T extends SoftDeletable>(rows: T[]): T[] {
    return rows.filter((row) => !isDeleted(row));
}

export function deletedOnly<T extends SoftDeletable>(rows: T[]): T[] {
    return rows.filter(isDeleted);
}
