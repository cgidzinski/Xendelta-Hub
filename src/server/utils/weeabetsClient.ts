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

// ===== TEMPORARY MOCK - real Weeabets isn't reachable here, remove before merging =====
// Fakes account lookup + transfer + ledger with in-memory state per discord id so game
// flows (and the Ledger tab) can be exercised end to end without a live Weeabets backend.
// Numbers are made up but move/accumulate consistently (wager debited, payout credited,
// each transfer logged) so UI behavior is representative.
const MOCK_XENCASINO_ACCOUNT_ID = 999_999;
const MOCK_STARTING_BALANCE = 1000;
const MOCK_XENCASINO_BALANCE = 1_000_000;
const mockAccountIdByDiscordId = new Map<string, number>();
const mockDiscordIdByAccountId = new Map<number, string>();
const mockBalances = new Map<number, number>();
const mockLedgerEntries: LedgerEntry[] = []; // most-recent first
let mockNextAccountId = 1;
let mockNextLedgerId = 1;

function mockResolveAccountId(discordId: string): number {
  let accountId = mockAccountIdByDiscordId.get(discordId);
  if (accountId === undefined) {
    accountId = discordId === XENCASINO_DISCORD_ID ? MOCK_XENCASINO_ACCOUNT_ID : mockNextAccountId++;
    mockAccountIdByDiscordId.set(discordId, accountId);
    mockDiscordIdByAccountId.set(accountId, discordId);
    mockBalances.set(accountId, discordId === XENCASINO_DISCORD_ID ? MOCK_XENCASINO_BALANCE : MOCK_STARTING_BALANCE);
  }
  return accountId;
}

// Ledger is from XenCasino's own perspective, same as the real endpoint: "credit" = money
// came in (counterparty paid XenCasino), "debit" = money went out (XenCasino paid
// counterparty). Only logs transfers that actually touch the XenCasino account, mirroring
// what the real ledger would contain.
function mockRecordLedgerEntry(params: { fromAccountId: number; toAccountId: number; amount: string; key: string; note: string }): void {
  let entryType: "credit" | "debit";
  let counterpartyId: number;
  if (params.toAccountId === MOCK_XENCASINO_ACCOUNT_ID) {
    entryType = "credit";
    counterpartyId = params.fromAccountId;
  } else if (params.fromAccountId === MOCK_XENCASINO_ACCOUNT_ID) {
    entryType = "debit";
    counterpartyId = params.toAccountId;
  } else {
    return; // neither side is XenCasino - shouldn't happen given the guarded-transfer rule
  }
  mockLedgerEntries.unshift({
    id: mockNextLedgerId++,
    entryType,
    amount: params.amount,
    counterpartyId,
    key: params.key,
    note: params.note,
    createdAt: new Date().toISOString(),
  });
}
// ===== END TEMPORARY MOCK =====

export async function getAccount(discordId: string): Promise<WeeabetsAccount | null> {
  const accountId = mockResolveAccountId(discordId);
  const balance = mockBalances.get(accountId)!;
  console.log(`[MOCK weeabetsClient] getAccount(${discordId}) -> accountId=${accountId} balance=${balance.toFixed(2)}`);
  return { accountId, displayName: `MockUser-${accountId}`, avatarUrl: "", balance: balance.toFixed(10) };

  /*
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
    balance: body.balance,
  };
  */
}

export async function transfer(params: {
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  key: string;
  note: string;
}): Promise<{ fromNewBalance: string; toNewBalance: string }> {
  console.log(`[MOCK weeabetsClient] transfer`, params);
  const amount = Number(params.amount);
  const fromBalance = mockBalances.get(params.fromAccountId) ?? MOCK_STARTING_BALANCE;
  const toBalance = mockBalances.get(params.toAccountId) ?? MOCK_STARTING_BALANCE;
  const fromNewBalance = fromBalance - amount;
  const toNewBalance = toBalance + amount;
  mockBalances.set(params.fromAccountId, fromNewBalance);
  mockBalances.set(params.toAccountId, toNewBalance);
  mockRecordLedgerEntry(params);
  console.log(
    `[MOCK weeabetsClient]   ${params.fromAccountId}: ${fromBalance.toFixed(2)} -> ${fromNewBalance.toFixed(2)} | ` +
      `${params.toAccountId}: ${toBalance.toFixed(2)} -> ${toNewBalance.toFixed(2)}`
  );
  return { fromNewBalance: fromNewBalance.toFixed(10), toNewBalance: toNewBalance.toFixed(10) };

  /*
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
      amount: params.amount,
      key: params.key,
      note: params.note,
    }),
  });
  if (!res.ok) {
    throw new WeeabetsTransferError(res.status, await res.text());
  }
  const body = (await res.json()) as { from_new_balance: string; to_new_balance: string };
  return { fromNewBalance: body.from_new_balance, toNewBalance: body.to_new_balance };
  */
}

export async function getLedger(params: { limit?: number; beforeId?: number } = {}): Promise<LedgerEntry[]> {
  // TEMPORARY MOCK - see the block above; real call kept commented out below.
  let entries = mockLedgerEntries;
  if (params.beforeId !== undefined) {
    entries = entries.filter((e) => e.id < params.beforeId!);
  }
  const limited = entries.slice(0, params.limit ?? entries.length);
  console.log(`[MOCK weeabetsClient] getLedger(${JSON.stringify(params)}) -> ${limited.length} entries`);
  return limited;

  /*
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
    amount: e.amount,
    counterpartyId: e.counterparty_id,
    key: e.key,
    note: e.note,
    createdAt: e.created_at,
  }));
  */
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
