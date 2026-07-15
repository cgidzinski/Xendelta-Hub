/**
 * MSW handlers standing in for the real Weeabets XenCasino API, active only when
 * MOCK_WEEABETS=true (see src/server/config/weeabets.ts). These intercept the exact same
 * requests weeabetsClient.ts's real fetch() calls make - the client code itself is
 * unmodified and unaware it's talking to a mock.
 *
 * In-memory state mirrors the real API's behavior closely enough to actually exercise the
 * paths that matter for testing the casino:
 *   - transfer() checks the sender's balance and 400s on insufficient funds, same as the
 *     real backend - so every game route's `WeeabetsTransferError` / 400 handling is
 *     reachable in dev, not just the happy path.
 *   - transfer() is idempotent by `key`: replaying the same key returns the cached prior
 *     result instead of re-applying the balance delta, matching the real backend's
 *     documented idempotency contract and actually validating the debit-at-start
 *     round-recovery logic Slots/Scratch Ticket rely on.
 */
import { http, HttpResponse } from "msw";
import { MOCK_WEEABETS_BASE_URL, XENCASINO_DISCORD_ID } from "../config/weeabets";

const STARTING_BALANCE = 1000;
const XENCASINO_STARTING_BALANCE = 1_000_000;
const XENCASINO_ACCOUNT_ID = 999_999;

interface MockLedgerEntry {
    id: number;
    entry_type: "credit" | "debit";
    amount: string;
    counterparty_id: number;
    key: string;
    note: string;
    created_at: string;
}

const accountIdByDiscordId = new Map<string, number>();
const balances = new Map<number, number>();
const ledger: MockLedgerEntry[] = []; // most-recent first
const transferResultsByKey = new Map<string, { from_new_balance: string; to_new_balance: string }>();
let nextAccountId = 1;
let nextLedgerId = 1;

function resolveAccountId(discordId: string): number {
    let accountId = accountIdByDiscordId.get(discordId);
    if (accountId === undefined) {
        accountId = discordId === XENCASINO_DISCORD_ID ? XENCASINO_ACCOUNT_ID : nextAccountId++;
        accountIdByDiscordId.set(discordId, accountId);
        balances.set(accountId, discordId === XENCASINO_DISCORD_ID ? XENCASINO_STARTING_BALANCE : STARTING_BALANCE);
    }
    return accountId;
}

// Ledger is from XenCasino's own perspective, same as the real endpoint: "credit" = money
// came in (counterparty paid XenCasino), "debit" = money went out (XenCasino paid
// counterparty).
function recordLedgerEntry(params: { from_account_id: number; to_account_id: number; amount: string; key: string; note: string }): void {
    let entryType: "credit" | "debit";
    let counterpartyId: number;
    if (params.to_account_id === XENCASINO_ACCOUNT_ID) {
        entryType = "credit";
        counterpartyId = params.from_account_id;
    } else if (params.from_account_id === XENCASINO_ACCOUNT_ID) {
        entryType = "debit";
        counterpartyId = params.to_account_id;
    } else {
        return; // neither side is XenCasino - shouldn't happen given the guarded-transfer rule
    }
    ledger.unshift({
        id: nextLedgerId++,
        entry_type: entryType,
        amount: params.amount,
        counterparty_id: counterpartyId,
        key: params.key,
        note: params.note,
        created_at: new Date().toISOString(),
    });
}

export const weeabetsHandlers = [
    http.get(`${MOCK_WEEABETS_BASE_URL}/api/xencasino/user/:discordId`, ({ params }) => {
        const discordId = String(params.discordId);
        const accountId = resolveAccountId(discordId);
        const balance = balances.get(accountId)!;
        return HttpResponse.json({
            account_id: accountId,
            display_name: `MockUser-${accountId}`,
            avatar_url: "",
            balance: balance.toFixed(10),
        });
    }),

    http.post(`${MOCK_WEEABETS_BASE_URL}/api/xencasino/transfer`, async ({ request }) => {
        const body = (await request.json()) as {
            from_account_id: number;
            to_account_id: number;
            amount: string;
            key: string;
            note: string;
        };

        const cached = transferResultsByKey.get(body.key);
        if (cached) {
            return HttpResponse.json(cached);
        }

        const amount = Number(body.amount);
        const fromBalance = balances.get(body.from_account_id) ?? STARTING_BALANCE;
        const toBalance = balances.get(body.to_account_id) ?? STARTING_BALANCE;
        if (fromBalance < amount) {
            return new HttpResponse("insufficient balance", { status: 400 });
        }

        const fromNewBalance = fromBalance - amount;
        const toNewBalance = toBalance + amount;
        balances.set(body.from_account_id, fromNewBalance);
        balances.set(body.to_account_id, toNewBalance);
        recordLedgerEntry(body);

        const result = { from_new_balance: fromNewBalance.toFixed(10), to_new_balance: toNewBalance.toFixed(10) };
        transferResultsByKey.set(body.key, result);
        return HttpResponse.json(result);
    }),

    http.get(`${MOCK_WEEABETS_BASE_URL}/api/xencasino/ledger`, ({ request }) => {
        const url = new URL(request.url);
        const limit = url.searchParams.get("limit");
        const beforeId = url.searchParams.get("before_id");

        let entries = ledger;
        if (beforeId) {
            entries = entries.filter((e) => e.id < Number(beforeId));
        }
        const limited = entries.slice(0, limit ? Number(limit) : entries.length);
        return HttpResponse.json({ entries: limited });
    }),
];
