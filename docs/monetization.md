# Monetization: what is built and what is planned

Issue #180 turned the old "points" into **gems** and made them something you buy. This document records what
that first change built, and every option that was discussed for later, with the decisions already taken, so the
thinking is not lost. Only the "built" section exists in code today.

## Principles

- **Gems are only bought** (or, later, earned from selling files). There is no free grant, no daily reward and no
  earning tasks. New accounts start with 0 gems. This was a deliberate choice.
- **Charge for what costs money**: storage, bandwidth and AI. Cosmetics cost nothing to provide, so they can be priced
  freely.
- **Never sell an advantage over the friends you share groups with.** XenSplit, XenBudget and XenNote are shared, so
  core features stay free for everyone in the group.
- **Gems cannot be refunded or cashed out.** Real-money payouts (for sellers) would go through Stripe Connect only.
- **No paid random loot boxes.** They are restricted in some countries. Fixed-content bundles are fine.

## What is built (issue #180)

- `users.points` became `users.gems` (migration `1794530000000-points-to-gems`). Balances carried over one for one.
  Held `1000-point-voucher` items became `1000-gem-voucher` and still redeem.
- **Gem packs are ordinary Shop items.** There are no gem-specific endpoints: `GET /api/shop` lists everything,
  `POST /api/shop/buy` buys anything. An item has either a gem `price` or a money `priceCents` (with `currency`). The
  packs are items in the `Gems` category with `grantsGems` and `addToInventory: false`, so buying one adds the gems
  and puts nothing in the inventory. Money-priced items go through the payment provider; gem-priced ones are paid from
  the balance.
- **Buying gems.** `src/shared/monetization.ts` lists the packs (5,000 / 11,000 / 30,000 / 65,000 gems for $5 / $10 /
  $25 / $50, so 1,000 gems to the dollar plus a bonus on the bigger packs). Gems were 200 to the dollar until #376,
  which multiplied packs and prices by 5 and reset everyone's gems and inventory (migration `1795200000000-gems-reset`). Checkout goes through a payment
  provider interface (`src/server/payments/`). Only a **dummy provider** exists: it takes no money and would credit
  the gems at once, so **buying gems is switched off everywhere** (`getPaymentProvider()` returns null; the Shop shows
  "Buying gems is not available yet"). Every purchase is recorded in `GemPurchase` (the audit trail of gems bought).
  - To turn it back on, return a real provider from `getPaymentProvider()`. `PAYMENTS_PROVIDER` is currently ignored.
- **Shop and Inventory** were redesigned on the shared UI components, and the Inventory link is back in the menu.
- **Free XenDrive tier.** Replaced by gem billing (#362, `docs/billing.md`): there is no storage quota or 1 GB voucher any more,
  and everyone has a free monthly allowance in gems instead.
- **Bugs fixed on the way**
  - The point voucher was priced at -1000, so buying it paid the buyer. It is no longer sold.
  - The Shop's category filter used each item's position in the list instead of its category.
  - An admin gift ran the item's effect and left the item redeemable, so a gifted voucher paid out twice.
  - Redeeming an item read the user, changed it and saved it, so two simultaneous redeems both worked. It is now one
    conditional update.

### Adding Stripe

1. Implement `startCheckout` in a new provider so it creates a Checkout Session and returns
   `{ kind: "redirect", url }`. The client already follows redirects. Any future money-priced item (a plan, say)
   uses the same path: give it `priceCents`, and say what it grants.
2. Add a webhook route that verifies the signature and calls `fulfilGemPurchase(purchaseId)`. It is idempotent: only
   the call that moves the purchase from `pending` to `completed` credits the gems.
3. Return the new provider from `getPaymentProvider()` and set `PAYMENTS_PROVIDER=stripe`.

`fulfilGemPurchase` credits the gems through the gem ledger before marking the purchase completed, so a crash in
between leaves a pending purchase whose retry finds the same transfer (`docs/billing.md`).

## Decided, not built yet

### Membership tiers (Free / Plus / Pro): dropped

Not building this. It was designed when storage was a quota to rent (a 1 GB free tier, 50 GB Plus, 250 GB Pro, plus 30-day
gem passes and GB vouchers). Pay-as-you-go billing (#362, #387; `docs/billing.md`) replaced the whole premise: there is no
storage quota, no voucher and no tier. Everyone gets a free monthly allowance in gems, and what is beyond it is paid per use
(storage per GB-month, calls per GB, scans per scan), from the person's gems or a community's fund. Nothing is ever deleted
when gems run out.

Two things from the old design are still open questions, to settle on their own if they come back:

- **A subscription.** If a flat monthly plan is ever wanted, it would be a way to pay for the same usage (or a bigger
  allowance), not a storage quota. The "no gems come from a tier" rule would still hold.
- **A tier badge or perks** (password-protected folder links, more file listings, a lower house fee on sales) would be
  cosmetics or limits on their own, decided when they are wanted.

### Cosmetics everywhere

**Built so far: the Golden Badge.** Wear or Take off from Inventory (`POST /api/user/inventory/:id/equip` and
`/unequip`); the choice is stored as `users.cosmetics.badge` (an item key). Every query that loads a person for
someone else's screen selects `PUBLIC_USER_FIELDS` (`server/utils/publicUser.ts`, which includes `cosmetics`), and the
serializers pass it on, so the badge arrives wherever a member or participant does. The client draws it with
`UserName` (`components/user/UserName.tsx`) next to the name. Trashing or admin-removing the last copy takes it off
(`utils/cosmetics.ts`). Names in plain strings (tooltips, aria-labels, joined lists, chart labels inside SVG) stay
text. Frames and name colours are not built; they need the shared avatar component below.


- Badges, avatar frames and name colours, sold in the Shop for gems (about 1,500 to 6,000) and equipped from
  Inventory. Values are theme token names, never colour literals.
- They only mean something if they show wherever a person is drawn. Today there is no shared avatar component: about
  73 separate `<Avatar>` calls in 47 files, and the server repeats `"username avatar"` in dozens of queries.
- Plan: one `PUBLIC_USER_FIELDS` constant on the server, a `PublicUser` type in `src/shared`, `UserAvatar` and
  `UserName` components, and a lint test that fails on a raw user `<Avatar>`.
- A tier badge shows without revealing dates (a `toJSON` transform strips them). `security.test.ts` must keep
  proving that other users never see `email`, `roles`, `inventory`, `gems` or membership data.

### Selling XenDrive files

- Any user can list a file or folder for a price in gems (10 to 100,000). Buyers must be signed in. The seller gets
  the price minus a house fee (20% was the figure planned with the tiers; it is to be decided now they are dropped). Gems are moved, not created, so the "only bought" rule holds.
- **One rule for whether something can be downloaded** (`canDownload`). A file that is listed, or sits inside a listed
  folder, can only be downloaded by its owner or a buyer. Without this, a listed file could be downloaded free through
  its own share link or through a public link to its parent folder.
- A folder listing sells the folder's current contents, including files added later. Deleting a sold file asks for
  confirmation and says how many people bought it.
- Deactivating a listing or changing its price never removes earlier buyers' access.
- Reports and admin takedowns: a takedown blocks new sales; access for earlier buyers is decided case by case and
  refunded through admin gem adjustments.
- Buying: insert the access row first (a unique index on buyer and listing stops double buys), then move the gems; if
  that fails, delete the access row. Record the fee in the ledger so payouts can later cover only gems earned from sales.
- Not allowed: the dummy provider cannot create gems from a sale; a seller cannot buy their own listing.

### A crash-safe gem ledger (no database transactions)

**Built** (#353): see `docs/billing.md`. Every gem movement now goes through it, which also closes the
`fulfilGemPurchase` gap described above. The original design is kept below for reference.

The test database and possibly production have no replica set, so Mongo transactions are not available.

1. Insert a `GemTransaction` with status `pending` and a unique `idempotencyKey`, so a retry is harmless.
2. Apply it in one update: `findOneAndUpdate({ _id, gemTxApplied: { $ne: txId }, gems: { $gte } }, { $inc, $push: { gemTxApplied: { $each: [txId], $slice: -100 } } })`.
3. Mark the row `applied`. If a debit's guard fails, mark it `failed` and answer 402.
4. An hourly `reconcilePendingGems()` finishes any `pending` row older than a minute.
5. Transfers (sales) write both rows as `pending` first, so a crash between the debit and the credit is finished by the sweep.
6. `npm run db:stats` gets a ledger-versus-balance mismatch report.

### AI credits

- `chargeFeature(userId, featureKey, run)` spends the cost listed in a `src/shared/aiFeatures.ts` catalogue, runs the
  job and refunds if it throws. The catalogue starts empty. No AI feature exists in the app yet.
- A `GemCostButton` shows "Uses N gems" and offers "Get gems" when the balance is short.
- Candidate features (best fit between price and cost): scan a receipt into split lines in XenSplit, auto-categorize
  XenBudget transactions, import a recipe from a URL or photo in XenKitchen, summarize or transcribe in XenNote, match
  paints from a photo in Recipaint.

### Test payments in production

The dummy provider works for admins only on a production server, so players cannot mint gems if it is left on.

## Deferred (noted, not decided)

- **Per-download gem fees.** The idea: each person is charged a small fee the first time they download a file through
  a share link, split 80% to the owner and 20% to the house, and re-downloads are free. Undecided: who pays (the
  owner per link, every public download, or the owner's balance for bandwidth). A fee means downloaders must sign in
  and hold gems, which changes how share links work today.
- **Stripe Connect payouts** for sale earnings only, after a holding period.
- **Cover images** for listings.
- **Gems to keep files stored or shared (ongoing cost): built** as pay-as-you-go billing (#350, #362, #387; see
  `docs/billing.md`). Storage is metered daily into byte-days and billed per GB-month beyond a free monthly allowance, and
  nothing is ever deleted when gems run out. Still undecided: a separate cost for keeping a file shared publicly, and a
  per-download fee (above), which would make downloaders sign in and hold gems.

## Other options considered

**Ways to bring in money**

- Ads on public pages only (public XenDrive folders, shared notes and recipes, the blog); Plus removes them.
- Affiliate links: Recipaint paints to a hobby store, XenKitchen ingredients to grocery delivery.
- Supporter tips: pay what you want for a supporter badge.
- Creator marketplace: users sell XenNote templates, XenRoutine programs, Recipaint colour schemes and XenKitchen
  recipe packs, with the house keeping a cut. Large to build, but it brings its own content and buyers.
- XenLink Pro: link-in-bio page, custom domain, analytics, QR codes.
- Paid exports and reports: a year-in-review PDF for XenBudget, a trip summary for XenSplit, a printable cookbook.
- Automatic backups with longer version history. The backup route already exists.
- Teams and clubs, billed per seat.
- XenSplit settle-up fees through Stripe Connect. Money-transfer regulation makes this heavy; do it last.

**More to spend gems on**

- Utility: a longer-lived public link, a custom short link, more pinned-app slots, version history, a priority queue for AI.
- Self-expression: animated names, profile banners, app accent themes, chat themes, sticker and reaction packs,
  notification sounds, cover images for notebooks, groups and recipes, a celebration effect when a XenSplit group settles.
- Templates for XenBudget, XenRoutine and XenNote.
- Social: gifting gems or items, boosting a public recipe or folder, spending gems to vote on the roadmap.
- One-off tokens: a username change, restoring a deleted item, early access to beta apps.
- Seasonal and limited-edition items with rarity tiers.

**Ways to earn gems that were rejected** (written down so they are not proposed again): onboarding bonuses, daily
check-ins and streaks, achievements and weekly quests, referrals, birthday gifts. The decision was no free gems.

## Defects found but not fixed here

Each should become its own issue.

- XenDrive's quota check trusts the file size the client claims, and finalize does not re-check the bytes uploaded.
- `MAX_XENDRIVE_SIZE` (5 GB) is defined but never enforced, and validation allows roughly 100 GB.
- Photos from other apps (XenSplit, XenBudget, XenNote, XenKitchen) are XenDrive files tagged with their app but don't
  count toward a person's storage yet: see `docs/storage.md` for the rule to switch on. Chat attachments do count.

## Suggested order of follow-up issues

1. Cosmetics everywhere (shared `UserAvatar` and `UserName`).
2. Selling XenDrive files.
3. Stripe provider and webhooks, then Stripe Connect payouts.
4. The first AI feature on `chargeFeature`.
5. XenDrive hardening (the defects above).
