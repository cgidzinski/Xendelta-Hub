/**
 * Weeabets XenCasino client
 * Thin wrapper over the two service-authenticated Weeabets endpoints (lookup, transfer)
 * plus the public ledger endpoint. Every game route and the shared balance/ledger route
 * go through this file rather than calling fetch() directly.
 */

import { WEEABETS_API_URL, WEEABETS_XENCASINO_SERVICE_TOKEN, XENCASINO_DISCORD_ID } from "../config/weeabets";

export class WeeabetsUnavailable extends Error {}

export class WeeabetsTransferError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface WeeabetsAccount {
  accountId: number;
  displayName: string;
  avatarUrl: string;
  balance: string;
}

export interface LedgerEntry {
  id: number;
  entryType: "credit" | "debit";
  amount: string;
  counterpartyId: number;
  key: string;
  note: string;
  createdAt: string;
}

function assertServiceConfigured(): void {
  if (!WEEABETS_API_URL || !WEEABETS_XENCASINO_SERVICE_TOKEN) {
    throw new WeeabetsUnavailable("Weeabets XenCasino integration is not configured");
  }
}

// Weeabets stores/returns amounts in raw units, but displays them (its bot, its own UI)
// multiplied by 100 - e.g. a raw balance of "1950" reads as "195,000" everywhere else.
// Every amount in/out of this file is converted at the wire boundary so the rest of
// XenCasino only ever deals in that same x100 "display" unit.
function toDisplayAmount(raw: string): string {
  return (Number(raw) * 100).toFixed(10);
}
function toRawAmount(display: string): string {
  return (Number(display) / 100).toFixed(10);
}

export async function getAccount(discordId: string): Promise<WeeabetsAccount | null> {
  assertServiceConfigured();
  const res = await fetch(`${WEEABETS_API_URL}/api/xencasino/user/${encodeURIComponent(discordId)}`, {
    headers: { Authorization: `Bearer ${WEEABETS_XENCASINO_SERVICE_TOKEN}` },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Weeabets account lookup failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    account_id: number;
    display_name: string;
    avatar_url: string;
    balance: string;
  };
  return {
    accountId: body.account_id,
    displayName: body.display_name,
    avatarUrl: body.avatar_url,
    balance: toDisplayAmount(body.balance),
  };
}

export async function transfer(params: {
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  key: string;
  note: string;
}): Promise<{ fromNewBalance: string; toNewBalance: string }> {
  assertServiceConfigured();
  const res = await fetch(`${WEEABETS_API_URL}/api/xencasino/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WEEABETS_XENCASINO_SERVICE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_account_id: params.fromAccountId,
      to_account_id: params.toAccountId,
      amount: toRawAmount(params.amount),
      key: params.key,
      note: params.note,
    }),
  });
  if (!res.ok) {
    throw new WeeabetsTransferError(res.status, await res.text());
  }
  const body = (await res.json()) as { from_new_balance: string; to_new_balance: string };
  return { fromNewBalance: toDisplayAmount(body.from_new_balance), toNewBalance: toDisplayAmount(body.to_new_balance) };
}

export async function getLedger(params: { limit?: number; beforeId?: number } = {}): Promise<LedgerEntry[]> {
  if (!WEEABETS_API_URL) {
    throw new WeeabetsUnavailable("Weeabets XenCasino integration is not configured");
  }
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.beforeId) qs.set("before_id", String(params.beforeId));
  const query = qs.toString();
  // Public endpoint - no bearer token needed, on purpose (transparency).
  const res = await fetch(`${WEEABETS_API_URL}/api/xencasino/ledger${query ? `?${query}` : ""}`);
  if (!res.ok) {
    throw new Error(`Weeabets ledger fetch failed: ${res.status} ${await res.text()}`);
  }
  interface RawLedgerEntry {
    id: number;
    entry_type: "credit" | "debit";
    amount: string;
    counterparty_id: number;
    key: string;
    note: string;
    created_at: string;
  }
  const body = (await res.json()) as { entries: RawLedgerEntry[] };
  return body.entries.map((e) => ({
    id: e.id,
    entryType: e.entry_type,
    amount: toDisplayAmount(e.amount),
    counterpartyId: e.counterparty_id,
    key: e.key,
    note: e.note,
    createdAt: e.created_at,
  }));
}

let xenCasinoAccountIdCache: number | null = null;

/** Resolves and caches XenCasino's own Weeabets account id (module-level, lazy). */
export async function getXenCasinoAccountId(): Promise<number> {
  if (xenCasinoAccountIdCache !== null) {
    return xenCasinoAccountIdCache;
  }
  if (!XENCASINO_DISCORD_ID) {
    throw new WeeabetsUnavailable("XENCASINO_DISCORD_ID is not configured");
  }
  const account = await getAccount(XENCASINO_DISCORD_ID);
  if (!account) {
    throw new WeeabetsUnavailable("XenCasino account not found on Weeabets");
  }
  xenCasinoAccountIdCache = account.accountId;
  return xenCasinoAccountIdCache;
}

export type ResolvedAccount = { linked: false } | { linked: true; account: WeeabetsAccount | null };

interface AuthProviderLike {
  provider: string;
  providerId: string;
  isActive: boolean;
}

interface UserLike {
  authProviders: AuthProviderLike[];
  weeabetsAccountId?: number;
  save: () => Promise<unknown>;
}

/**
 * Resolves a Mongoose user's Weeabets account via their linked Discord id, caching
 * `weeabetsAccountId` on the user doc on first success so the ledger route can later
 * match counterparty ids back to a display name without re-querying Weeabets.
 */
export async function resolveUserAccount(user: UserLike): Promise<ResolvedAccount> {
  const discordProvider = user.authProviders?.find((p) => p.provider === "discord" && p.isActive);
  if (!discordProvider) {
    return { linked: false };
  }
  const account = await getAccount(discordProvider.providerId);
  if (account && user.weeabetsAccountId !== account.accountId) {
    user.weeabetsAccountId = account.accountId;
    await user.save();
  }
  return { linked: true, account };
}
