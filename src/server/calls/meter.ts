// Calls on the bill (#371, docs/billing.md): what a call delivers is metered while it runs, and the people who pay for it are
// checked as it goes. A call's cost is split evenly between the people in it; a community's voice channel is paid from the
// community's fund, as it is used. Features are cut off only above the free allowance: a payer who can still pay is never
// interrupted, and a payer who can't is warned first and taken out of the call on the next check.
import { CALL_MAX_SESSION_SECONDS, CALL_METER_SECONDS } from "@shared/calls";
import { communityAccount, userAccount } from "../billing/ledger";
import { assertCanSpend, canSpend } from "../billing/settlement";
import { billingEnforced } from "../billing/usage";
import { meterCall } from "./usage";
import { resolveChatAccess } from "../chat/access";
import { realtime } from "../realtime";
import { callRegistry } from "./registry";
import { leaveCall } from "./service";

/** Refuses (402) when the person, or the community of a voice channel, can't pay for a call. Nothing in shadow mode. */
export async function assertCanCall(userId: string, communityId?: string): Promise<void> {
  if (!billingEnforced()) return;
  await assertCanSpend(communityId ? communityAccount(communityId) : userAccount(userId));
}

/**
 * Check that everyone paying for the call still can. The first time someone can't they are warned; the next check takes
 * them out of the call (the whole voice channel, when it is the community that can't pay).
 */
export async function enforceCallBilling(conversationId: string): Promise<void> {
  if (!billingEnforced()) return;
  const call = callRegistry.get(conversationId);
  if (!call) return;
  const payers = call.communityId
    ? [{ key: "community", account: communityAccount(call.communityId), people: [...call.participants.keys()] }]
    : [...call.participants.keys()].map((id) => ({ key: id, account: userAccount(id), people: [id] }));
  for (const payer of payers) {
    if (await canSpend(payer.account)) {
      call.warned.delete(payer.key);
      continue;
    }
    const ending = call.warned.has(payer.key);
    call.warned.add(payer.key);
    const message = call.communityId
      ? ending
        ? "This community has used its free allowance and its fund is empty, so the call has ended."
        : "This community has used its free allowance and its fund is empty. The call will end soon unless someone donates."
      : ending
        ? "You've used your free allowance for the month, so the call has ended for you."
        : "You've used your free allowance for the month. The call will end soon unless you add gems.";
    realtime.toUsers(payer.people, "call:billing", { conversationId, message, ending });
    if (!ending) continue;
    for (const userId of payer.people) {
      const context = await resolveChatAccess(conversationId, userId);
      if (context) await leaveCall(context, userId);
      else callRegistry.leave(conversationId, userId);
    }
  }
}

/** Take out anyone who has been in the call longer than anyone is billed for (their tab never said goodbye). */
async function endStaleSessions(conversationId: string, now: number): Promise<void> {
  const call = callRegistry.get(conversationId);
  if (!call) return;
  for (const p of [...call.participants.values()]) {
    if (now - Date.parse(p.joinedAt) <= CALL_MAX_SESSION_SECONDS * 1000) continue;
    const context = await resolveChatAccess(conversationId, p.userId);
    if (context) await leaveCall(context, p.userId);
    else callRegistry.leave(conversationId, p.userId);
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Start the meter (once): every half minute each running call is metered and its payers checked. */
export function ensureCallMeter(): void {
  if (timer) return;
  timer = setInterval(() => {
    for (const id of callRegistry.ids()) {
      void (async () => {
        await meterCall(id);
        await enforceCallBilling(id);
        await endStaleSessions(id, Date.now());
      })().catch((e) => console.error(">>> Call meter failed:", e));
    }
  }, CALL_METER_SECONDS * 1000);
  timer.unref?.();
}
