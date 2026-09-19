// Reconstructs a group as it stood just before a given settlement, so the
// Settlements page can re-run the balance engine over it and show what the
// pending list looked like at that moment.
//
// This is a reconstruction, not a snapshot — the group document holds only
// current state. What it CANNOT recover, and what the UI must therefore say
// plainly rather than imply otherwise:
//   - expense edits are not versioned, so an expense that existed then but has
//     been edited since appears with its current amount and splits;
//   - `on_hold` is current state, with no history of when it was toggled;
//   - members added or removed since are not reconstructed.

import type { Expense, Settlement, Exchange, XenSplitDocument } from "./balances";

type Timestamped = { created_at?: Date | string };

export interface RewindDocument extends XenSplitDocument {
  expenses: (Expense & Timestamped)[];
  settlements: (Settlement & { _id?: unknown })[];
  exchanges?: (Exchange & Timestamped)[];
}

function timeOf(value: Date | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? undefined : t;
}

// Newest first. Ties on an identical settled_at fall back to array order,
// DESCENDING: settlements are appended to the group document, so a higher index
// was recorded later. Two settlements saved in the same second must order the
// same way every time, or "this one and everything after it" is ambiguous.
//
// The History list renders in this order too (see GroupSettlements.tsx), so what
// the rewind excludes always matches what the user sees below the cut.
function order(settlements: RewindDocument["settlements"]) {
  return settlements
    .map((settlement, index) => ({ settlement, index }))
    .sort((a, b) => (timeOf(b.settlement.settled_at) ?? 0) - (timeOf(a.settlement.settled_at) ?? 0) || b.index - a.index);
}

/** The History list's order: newest first, ties broken deterministically. */
export function settlementsNewestFirst<S extends RewindDocument["settlements"][number]>(settlements: S[]): S[] {
  return order(settlements).map((entry) => entry.settlement as S);
}

/**
 * The settlements a rewind to `settlementId` drops: that settlement itself plus
 * every settlement recorded after it. Used to dim the excluded history rows.
 * Empty if the id isn't in the document.
 */
export function excludedSettlementIds(doc: RewindDocument, settlementId: string): Set<string> {
  const ordered = order(doc.settlements);
  const cut = ordered.findIndex((entry) => String(entry.settlement._id) === settlementId);
  if (cut === -1) return new Set();
  return new Set(ordered.slice(0, cut + 1).map((entry) => String(entry.settlement._id)));
}

/**
 * A copy of `doc` with the given settlement, and everything recorded after it,
 * removed. Returns `doc` unchanged if the settlement isn't found.
 *
 * Expenses and exchanges are cut on `created_at`, never on `date` — `date` is
 * user-settable and recurring occurrences are deliberately backdated (see
 * xensplitRecurringHandler), so `date` would wrongly keep an expense that was
 * entered days after the settlement. An entry with no `created_at` at all is
 * kept, on the grounds that dropping real expenses is the worse failure.
 */
export function rewindBefore<D extends RewindDocument>(doc: D, settlementId: string): D {
  const ordered = order(doc.settlements);
  const cut = ordered.findIndex((entry) => String(entry.settlement._id) === settlementId);
  if (cut === -1) return doc;

  const cutAt = timeOf(ordered[cut].settlement.settled_at);
  const keptIndices = new Set(ordered.slice(cut + 1).map((entry) => entry.index));
  const createdBeforeCut = (entry: Timestamped) => {
    if (cutAt === undefined) return true;
    const created = timeOf(entry.created_at);
    return created === undefined || created <= cutAt;
  };

  return {
    ...doc,
    expenses: doc.expenses.filter(createdBeforeCut),
    settlements: doc.settlements.filter((_, index) => keptIndices.has(index)),
    ...(doc.exchanges ? { exchanges: doc.exchanges.filter(createdBeforeCut) } : {}),
  };
}
