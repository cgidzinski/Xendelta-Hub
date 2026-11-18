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
- The ledger starts from zero: the migration `1795200000000-gems-reset` (#376) set every balance and fund to 0 and
  cleared every inventory, so every gem since is in the history.

To move gems, call `transfer({ from, to, amount, kind, idempotencyKey })` with `userAccount(id)`,
`communityAccount(id)` or `HOUSE`. Pick a key that names the movement (`gem-purchase:<purchaseId>`,
`voucher:<inventoryItemId>`), so a retry of the same thing can't pay twice.

## Cost centers (`src/shared/billing.ts`)

`COST_CENTERS` lists everything that costs money, each with its unit, rate, who pays and its status. A center starts free (`status: "free"`, `costRate: 0`); its discussion issue decides the rate and switches it to `metered`.
**Storage is metered** (15 gems per GB-month at cost, 18.75 billed) and billing is always on: months are charged and uploads
are blocked past the free allowance. There is no switch; raise the free allowance in `src/shared/billing.ts` to be gentler.
Downloads and uploads are free on R2, so there is no downloads center.

| Center | Unit stored | Billed in | Paid by | Discussion |
|---|---|---|---|---|
| `storage` | byte-days | GB-month | the person or community | #370 |
| `calls` | bytes (SFU and TURN are one cost) | GB | the people in the call (split evenly), or the community for a voice channel | #371 |
| `recipe_scans` | scans | scan | the person | #372 |
| `receipt_scans` | scans | scan | the person | #396 |
| `public_assets` | byte-days | GB-month | house | #373 |
| `backups` | byte-days | GB-month | house | #373 |
| `email` | emails | email | house | #373 |

- **Billed rate** = `costRate × BILLING_MARGIN`. House centers are never billed; they are recorded so the admin report
  shows what they cost.
- **Free tier:** `PERSON_FREE_TIER_GEMS` / `COMMUNITY_FREE_TIER_GEMS` (2,000 and 5,000 gems, worth $2 and $5 at 1,000 gems to the dollar) a month, taken off the whole bill. No roll-over.
- **Rounding:** usage is stored in whole units and gems are worked out from them as fractions. A bill's lines show
  one decimal, rounded up (`formatGems`: "0.4 gems", "less than 0.1 gems"). The amount due is the month's total
  beyond the free tier, rounded up to a whole gem **once** (`ceilGems`), so the lines still add up to it.
- Months are calendar months in UTC (`billingMonth`).

## The usage meter (`src/server/billing/usage.ts`)

`recordUsage(account, center, units)` adds to a `UsageRecord` (one per account, month and center, upserted with
`$inc`). It never throws: a tally that can't be kept must not break the request. `usageFor(account, month)` reads it
back. Usage is only ever what the server observes, never what a client reports.

Billing is always enforced (there is no shadow mode). The storage quota and vouchers were removed when it was switched on (#362). Statements
from the months before that have the status `shadow` and show as "Not charged".

### Wiring a cost center

1. Agree its rules and rate in its discussion issue.
2. Call `recordUsage` where the server observes the usage, with the account that pays.
3. Call `canSpend(account)` before starting something that costs money (an upload, a call, a scan).
4. Set its `costRate` and `status: "metered"` in `COST_CENTERS`, and add an `appGuide.ts` line if people should know.

### Calls (`src/server/calls/meter.ts`, #371)

Cloudflare Realtime bills SFU and TURN together: **62.5 gems per GB** delivered (50 at cost, $0.05). While a call runs, every
30 seconds (and whenever someone joins, leaves or changes what they send) the server adds what it delivered to the bill: each
person receives what every other participant sends, at the most the client lets them (`CALL_BITRATE_BPS` in `shared/calls.ts`:
audio 32 kbps, camera 1.5 Mbps, screen share 2.5 Mbps, set as `maxBitrate` when publishing), so the estimate is an upper bound.
**A call's cost is split evenly between the people in it.** A community's voice channel is paid from the community's fund,
as it is used. A tab that never said goodbye is taken out of the call after 4 hours, and nobody is billed past that.

Joining needs the payer (you, or the community) to be able to spend. During a call the payers are checked every 30 seconds: the
first time one can't pay they are warned (`call:billing`), the next check takes them out of the call (the whole voice channel,
when it is the community). Anyone who can still pay is never interrupted.

### Recipe scans (`routes/xenkitchen.ts`, #372)

A scan is **2.5 gems** (2 at cost, a few photos of one recipe) on the month's bill, counted once the model has run whether or
not it found a recipe. It is refused first (402) when the free allowance is used up and the gems can't cover it.

### Receipt scans (`routes/xensplit.ts`, #396)

`POST /api/xensplit/scan-receipt` reads one photo of a receipt into lines, tax, tip and total (`readReceiptFromImage` in
`ai/vision.ts`, parsed by `utils/receiptImport.ts`). It is billed exactly like a recipe scan: **2.5 gems**, counted once the
model has run whether or not it found any lines, and refused first (402) when the allowance is used up. Nothing is saved: the
expense form shows the lines for a person to assign (`ReceiptScanDialog`, `receiptSplit.ts`).

### Free allowance

`PERSON_FREE_TIER_GEMS` is 2,000 a month (about 100 GB-months of storage) and `COMMUNITY_FREE_TIER_GEMS` 5,000, generous on purpose
while the hub is small: most accounts will never reach it. Change them in `src/shared/billing.ts`.

### Public uploads (#373)

Avatars, group pictures and blog images are the house's, and not limited. Custom emoji are paid by where they were added: the
community's fund for a community, the person who added it for a group chat (a group has no account of its own). Recipaint images
are paid by the uploader. The house's own costs (email, backups, request fees) are entered by an admin from the invoices
(`docs/billing.md` > Admin billing report).

### The storage meter (`src/server/billing/storageMeter.ts`)

The hourly `storage-meter` job adds each payer's stored bytes to their `storage` usage once a day, as byte-days, so a month's
usage is the sum of its daily sizes. Sizes come from the file records (`docs/storage.md`): a payer's files, never their
thumbnails or previews; house files are left to #373. A day is claimed with a unique `MeterRun` row, so it is metered once even
if the job runs twice; a day the server missed is caught up (up to 31 days) from what existed by its end. A crash between the
claim and the finish loses that one day, which can only under-bill.

`assertCanStore(userId, source)` and `assertPayerCanStore(payer)` run before anything is stored (XenDrive uploads, app photos,
chat attachments, community emoji, Recipaint images). A payer past the free
allowance with no gems to cover it gets a 402. Nothing is ever deleted.

## Community funds (`src/server/billing/fund.ts`)

A community's bills are paid from its fund. Any member can donate, including ahead of time; the fund carries over.

- `POST /api/communities/:communityId/fund/donate` `{ gems, requestId }`: a ledger `donation` from the member, keyed by
  `requestId` (made by the client), so a retried request can't donate twice. 402 when the member doesn't have the gems.
- `GET /api/communities/:communityId/fund`: the balance and the last 50 movements (donations with who gave, bill
  payments). Members only; anyone else gets 404.
- Members get `community:fund` over realtime when it changes.
- `donationsOpen` is `communitiesBilled()`: the Donate button stays hidden until some center billed to communities is
  switched on, so nobody donates to a fund that pays for nothing.

## Settlement and `canSpend` (`src/server/billing/settlement.ts`)

- The hourly `billing-settlement` job closes **every finished month that isn't settled yet**, so a server that was down
  on the 1st catches up. Each account that used something gets one `BillingStatement` (unique per account and month)
  with its lines, the rates and margin used, the free tier and the amount due.
- The statement is written `pending`, then settled:
  - `free`: nothing due.
  - `shadow`: a month from before billing was switched on; something was due but nothing was taken.
  - `paid`: a ledger `bill` to the house, keyed `bill:<type>:<id>:<month>`, so a rerun can't pay twice.
  - `unpaid`: the balance couldn't cover it. Nothing is taken and the whole amount stays owed.
- People (or every member of a community) are notified when a statement has something due, and once a month when
  usage reaches 80% of the free tier (`BillingNotice` keeps it to once).
- `canSpend(account)` is the one check a cost center makes before starting something that costs money: yes while this month is inside the free tier with nothing unpaid, or while the balance is above
  this month's cost beyond the free tier (rounded up) plus anything unpaid. `assertCanSpend` throws a 402 with
  `billing: true` and a message that says what to do. Storage (`assertCanStore`), calls and recipe scans call it before they start.

## Admin billing report (`src/server/routes/admin/billing.ts`)

`GET /api/admin/billing?month=YYYY-MM` sets, for a month and each cost center, what was measured (people, communities
and the house together), what it billed and what it cost at the cost rate, beside what each provider actually charged.
Actual costs are entered from the invoices with `PUT /api/admin/billing/costs/:month/:provider` `{ amountCents }`
(audited as `provider_cost_set`) and converted at `BASE_GEMS_PER_DOLLAR`. Totals: free tier given to people and to
communities, due, collected and unpaid from that month's statements. House centers keep the margin honest: what nobody
is billed for still shows as a cost.
