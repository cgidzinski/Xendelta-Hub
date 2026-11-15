// What a running call has delivered, added to the bill of whoever pays for it (docs/billing.md).
import { communityAccount, userAccount } from "../billing/ledger";
import { recordUsage } from "../billing/usage";
import { callRegistry } from "./registry";

/** Add what the call has cost since the last time to its payers' usage. */
export async function meterCall(conversationId: string, now: number = Date.now()): Promise<void> {
  const taken = callRegistry.takeUsage(conversationId, now);
  if (!taken) return;
  const each = taken.bytes / taken.payers.length;
  for (const payer of taken.payers) {
    await recordUsage(
      payer.type === "community" ? communityAccount(payer.id) : userAccount(payer.id),
      "calls",
      each,
      new Date(now),
    );
  }
}
