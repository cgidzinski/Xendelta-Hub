# Billing

Gem billing for everything that costs money (issue #350). This document describes what is built. The plan and the cost
inventory are in #350; each cost center is decided in its own issue (#370 XenDrive, #371 Calls, #372 Recipe scanning,
#373 House costs).

**Not billed, ever:** text chat, the database, server CPU and image processing. The hub is self-hosted, so they cost
nothing per user.

## Accounts

A gem balance belongs to one of three kinds of account:

| Account | Balance | Notes |
|---|---|---|
| A person | `users.gems` | Whole gems. |
| A community | `communities.fund` | Whole gems, donated by members. Carries over month to month. |
| The house | none | Where bought gems come from and where bills go. Never runs out, never blocks. |

## The ledger (`src/server/billing/ledger.ts`)

**Every** gem movement is a `GemTransaction` applied by `transfer()`: gem packs (`gem_purchase`), Shop purchases and
refunds, gem vouchers, feedback rewards, admin adjustments, donations and bills. Nothing else may change `gems` or
`fund`; `npm run db:stats` reports any balance that doesn't match its transactions.

There are no MongoDB transactions (no replica set), so each movement is made safe step by step:

1. Insert the row as `pending` under a unique `idempotencyKey`. A retry with the same key finds the same row.
2. Debit the payer in one guarded update: `{ gemTxApplied: { $ne: txId }, gems: { $gte: amount } }`, which also pushes
   `txId` onto `gemTxApplied`. If the guard fails and the payer hasn't already been debited, the row becomes `failed`
   and `transfer` throws `AppError(402)`. Nothing moved.
3. Credit the receiver with the same `$ne` guard.
4. Mark the row `applied`.

A crash between the steps leaves a `pending` row. The hourly `gem-ledger-reconcile` job (`reconcilePendingGems`)
finishes every pending row older than a minute; the `$ne` guards make each side happen at most once.

- `gemTxApplied` keeps the last 200 ids and is `select: false`, so it is never sent anywhere.
- `debitPush` lets a purchase add its inventory item in the same write as the debit, so a crash can't take the gems
  without the item. It is stored on the row so the sweep pushes it too.
- Amounts are whole gems (at least 1). Fractions only exist in usage and statements, and are rounded up before paying.
- The migration `1795100000000-gem-ledger-opening-balances` records each person's balance at the start as an
  `opening_balance` from the house, so the history adds up from day one.

To move gems, call `transfer({ from, to, amount, kind, idempotencyKey })` with `userAccount(id)`,
`communityAccount(id)` or `HOUSE`. Pick a key that names the movement (`gem-purchase:<purchaseId>`,
`voucher:<inventoryItemId>`), so a retry of the same thing can't pay twice.

## Cost centers (`src/shared/billing.ts`)

`COST_CENTERS` lists everything that costs money, each with its unit, rate, who pays and its status. **Every center
starts free** (`status: "free"`, `costRate: 0`); its discussion issue decides the rate and switches it to `metered`.

| Center | Unit stored | Billed in | Paid by | Discussion |
|---|---|---|---|---|
| `storage` | byte-days | GB-month | the person or community | #370 |
| `downloads` | bytes | GB | the person or community | #370 |
| `calls` | bytes (SFU and TURN are one cost) | GB | the person or community | #371 |
| `recipe_scans` | scans | scan | the person | #372 |
| `public_assets` | byte-days | GB-month | house | #373 |
| `backups` | byte-days | GB-month | house | #373 |
| `email` | emails | email | house | #373 |

- **Billed rate** = `costRate × BILLING_MARGIN`. House centers are never billed; they are recorded so the admin report
  shows what they cost.
- **Free tier:** `PERSON_FREE_TIER_GEMS` / `COMMUNITY_FREE_TIER_GEMS` a month, taken off the whole bill. No roll-over.
- **Rounding:** usage is stored in whole units and gems are worked out from them as fractions. A bill's lines show
  one decimal, rounded up (`formatGems`: "0.4 gems", "less than 0.1 gems"). The amount due is the month's total
  beyond the free tier, rounded up to a whole gem **once** (`ceilGems`), so the lines still add up to it.
- Months are calendar months in UTC (`billingMonth`).

## The usage meter (`src/server/billing/usage.ts`)

`recordUsage(account, center, units)` adds to a `UsageRecord` (one per account, month and center, upserted with
`$inc`). It never throws: a tally that can't be kept must not break the request. `usageFor(account, month)` reads it
back. Usage is only ever what the server observes, never what a client reports.

**Shadow mode:** while `BILLING_ENFORCED` is not `true` (the default), usage is measured and bills are shown, but
nothing is charged and nothing is blocked.

### Wiring a cost center

1. Agree its rules and rate in its discussion issue.
2. Call `recordUsage` where the server observes the usage, with the account that pays.
3. Call `canSpend(account)` before starting something that costs money (an upload, a call, a scan).
4. Set its `costRate` and `status: "metered"` in `COST_CENTERS`, and add an `appGuide.ts` line if people should know.
