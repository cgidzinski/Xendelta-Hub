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
- **Buying gems.** `src/shared/monetization.ts` lists the packs (1,000 / 2,200 / 6,000 / 13,000 gems for $5 / $10 /
  $25 / $50, so 200 gems to the dollar plus a bonus on the bigger packs). Checkout goes through a payment
  provider interface (`src/server/payments/`). Only a **dummy provider** exists: it takes no money and credits the
  gems at once. Every purchase is recorded in `GemPurchase` (the audit trail of gems bought).
  - `PAYMENTS_PROVIDER` is `dummy` or `none`. Unset means `dummy` in development and `none` in production, so a
    deployment cannot hand out free gems by accident. `dummy` in production works for admins only.
- **Shop and Inventory** were redesigned on the shared UI components, and the Inventory link is back in the menu.
- **Free XenDrive tier.** Everyone gets 1 GB (`FREE_STORAGE_BYTES`). Before, new users had 0 bytes and relied on the
  1,000 starting points to buy space. `xendrive.spaceAllowed` is now the extra space on top of the free tier (admin
  grants and redeemed vouchers).
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

Known limit: `fulfilGemPurchase` marks the purchase completed and then credits the gems as two writes, so a crash
between them would leave a completed purchase without gems. The ledger design below closes that gap; build it
before real money is involved.

## Decided, not built yet

### Membership tiers (Free / Plus / Pro)

| | Free | Plus | Pro |
|---|---|---|---|
| Price by card | none | $5 a month | $10 a month |
| 30-day pass in gems | none | 1,000 gems | 2,000 gems |
| XenDrive storage (total) | 1 GB | 50 GB | 250 GB |
| Largest single file | 2 GB | 2 GB | 5 GB |
| Password-protected folder links | no | yes | yes |
| Active file listings | 3 | 10 | 50 |
| House fee on file sales | 20% | 20% | 10% |
| Badge | none | Plus | Pro |

- **No gems come from a tier.** No Family plan.
- Each tier is paid either **monthly by card** or as a **30-day pass bought with gems**. Passes stack.
- Storage becomes rented through tiers, so the permanent GB vouchers would be retired (ones already owned still work).
- Rules worked out:
  - A card subscription and passes are mutually exclusive on one account. While a card is active and not cancelling,
    passes cannot be bought; change the plan instead. Passes bought after cancelling start when the paid period ends.
  - A higher tier pauses a lower one: buying Pro while Plus has days left starts Pro now and pushes the remaining Plus
    days back until Pro ends. No days are lost.
  - Tier checks are by date (`proUntil`, `plusUntil`), so nothing has to run when a tier lapses.
  - A lapse deletes nothing and makes nothing more public: files stay but uploads stop while over quota; protected
    folder links stay protected but cannot be created or edited; listings over the limit stay live but no new ones
    can be created; earlier buyers keep their access.
  - A notification goes out 3 days before a pass-only membership ends.

### Cosmetics everywhere

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
  the price minus the house fee (see the tiers table). Gems are moved, not created, so the "only bought" rule holds.
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
- File-link passwords are stored and compared as plain text, and the owner's API returns them.
- Folder share links have no password or expiry.

## Suggested order of follow-up issues

1. Membership tiers and gem passes (including the ledger).
2. Cosmetics everywhere (shared `UserAvatar` and `UserName`).
3. Selling XenDrive files.
4. Stripe provider and webhooks, then Stripe Connect payouts.
5. The first AI feature on `chargeFeature`.
6. XenDrive hardening (the defects above).
