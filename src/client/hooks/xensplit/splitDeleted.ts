import { liveOnly, deletedOnly } from "../../../shared/xensplit/softDelete";
import type { XenSplit } from "./types";

/**
 * Partitions a group's ledger into live records and deleted ones.
 *
 * Soft-deleted expenses, settlements and exchanges arrive from the API inside the
 * ordinary arrays, because the views that reveal them need them. But a dozen components
 * read `group.expenses` directly - analytics, the explain page, the group cards, the
 * recurring "final occurrence" marker, the settlements rewind - and every one of them
 * would silently start counting deleted records.
 *
 * So both group queries run this in react-query's `select`: the arrays are narrowed to
 * live records and the deleted ones move to `group.deleted`. Existing consumers are
 * then correct with no change, and only the views that opt in read the tombstones.
 *
 * Balances are protected separately and at a lower level - calculateBalances skips
 * deleted records itself, so the server's figures and the client's rewind preview agree
 * regardless of what any component passes in.
 */
export function splitDeleted(group: XenSplit): XenSplit {
    const exchanges = group.exchanges ?? [];
    return {
        ...group,
        expenses: liveOnly(group.expenses),
        settlements: liveOnly(group.settlements),
        exchanges: liveOnly(exchanges),
        deleted: {
            expenses: deletedOnly(group.expenses),
            settlements: deletedOnly(group.settlements),
            exchanges: deletedOnly(exchanges),
        },
    };
}
