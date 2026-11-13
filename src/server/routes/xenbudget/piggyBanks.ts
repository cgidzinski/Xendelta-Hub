import { Request, Response } from "express";
import { AppError } from "../../utils/http";
import { XenBudgetItem } from "../../models/xenBudget";
import {
  validate,
  validateParams,
  createXenBudgetPiggyBankSchema,
  updateXenBudgetPiggyBankSchema,
  createXenBudgetContributionSchema,
  updateXenBudgetContributionSchema,
  xenBudgetPiggyBankParamSchema,
  xenBudgetContributionParamSchema,
  xenBudgetBookIdParamSchema,
} from "../../utils/validation";
import {
  resolveShares,
  resolveCategories,
  computeImportHash,
  roundMoney,
  budgetPeriodRange,
  previousPeriodRanges,
} from "../../utils/xenBudgetUtils";
import { FLAG_OFF_BUDGET } from "../../constants";

import { serializeBookFor } from "../../utils/xenBudgetSerializer";
import { summarizePiggyBank } from "../../utils/xenBudgetPiggyBanks";
import { PUBLIC_USER_FIELDS } from "../../utils/publicUser";
import {
  bookDateToUtc,
  broadcastBook,
  buildShares,
  callerId,
  loadBookForMember,
  memberIds,
  normalizeMeasures,
} from "./shared";

/**
 * Which item type a budget counts.
 *
 * "saving" counts the same EXPENSE items a cap would - money moved into a savings category
 * has left the account it was sitting in - and differs only in reading as a floor. That
 * split is the whole point of the third value: direction and item type stop being the same
 * question.
 */
function itemTypeFor(measures: any): string {
  return normalizeMeasures(measures) === "income" ? "income" : "expense";
}

/**
 * Turns the names a rule or an import produced into stored weights, split evenly. A
 * caller that wants an uneven split (the item form) resolves its own and passes them in.
 */
function evenCategoryWeights(names: string[], amount: number) {
  return resolveCategories(
    "equal",
    amount,
    (names || []).map((name) => ({ name })),
  );
}

// --- Piggy banks ------------------------------------------------------------

// A piggy bank's category has to exist in this book, for the same reason a budget's target
// does: a name nothing else uses would tag every mirrored transaction into a category
// that appears in no report and no budget.
function validatePiggyBankCategory(body: any, book: any): string | null {
  if (!body.category) return null;
  const known = (book.categories || []).some((c: any) => c.name === body.category);
  return known ? null : "That category is not in this book";
}

// Only the fields the request actually carried, so the card's small edits (Mark complete,
// Archive) can PUT a status on its own without resending a bank they never loaded whole.
function toPiggyBankFields(body: any, book: any, existing?: any): Record<string, any> {
  const fields: Record<string, any> = {};
  if (body.name !== undefined) fields.name = body.name;
  if (body.description !== undefined) fields.description = body.description;
  if (body.target_amount !== undefined) fields.target_amount = roundMoney(body.target_amount);
  if (body.currency !== undefined) fields.currency = body.currency;
  if (body.category !== undefined) fields.category = body.category;
  if (body.status !== undefined) {
    fields.status = body.status;
    // Stamped when the bank is marked done and cleared when it is reopened, so a card can
    // say WHEN it landed rather than only that it did.
    if (body.status === "completed") {
      fields.completed_at = existing?.completed_at || new Date();
    } else {
      fields.completed_at = undefined;
    }
  }
  if (!existing) {
    fields.currency = fields.currency || book.default_currency;
    fields.status = fields.status || "active";
  }
  return fields;
}

/**
 * The book item a contribution books. Always created - contributing IS booking an expense.
 *
 * Money into a piggy bank is surplus being consumed from the budget line it came from, so
 * it books as an expense under the bank's category; a withdrawal releases it and books as
 * income there. Auto-tagging rules are deliberately not run over it - the bank already
 * decides what this money is, and a rule re-tagging it would file the telescope fund under
 * groceries.
 */
/** What a contribution's item is called when the note doesn't name it. */
function contributionDescription(bank: any, out: boolean, note?: string): string {
  return note || `${out ? "From piggy bank" : "Piggy bank"}: ${bank.name}`;
}

async function createContributionItem(
  book: any,
  bank: any,
  userId: string,
  magnitude: number,
  out: boolean,
  date: Date,
  note?: string,
): Promise<any> {
  const description = contributionDescription(bank, out, note);
  const item = new XenBudgetItem({
    book_id: book._id,
    type: out ? "income" : "expense",
    amount: magnitude,
    currency: bank.currency || book.default_currency,
    date,
    description,
    categories: bank.category ? evenCategoryWeights([bank.category], magnitude) : [],
    category_split_type: "equal",
    // Attributed to whoever moved the money, the same way the bank's own per-person
    // breakdown is.
    ...buildShares({ amount: magnitude, share_type: "exact", shares: [{ user_id: userId, amount: magnitude }] }, book),
    source: "manual",
    // A re-apply sweep skips hand-edited items, which is exactly what this is: the bank
    // decided its category, and a later sweep must not move it somewhere else.
    manually_edited: true,
    import_hash: computeImportHash(date, magnitude, description),
    created_by: userId,
  });
  await item.save();
  return item;
}

/** The item a contribution created, if it still exists. */
async function linkedItem(book: any, contribution: any): Promise<any | null> {
  if (!contribution.item_id) return null;
  return XenBudgetItem.findOne({ _id: contribution.item_id, book_id: book._id });
}

async function saveAndRespond(req: Request, res: Response, book: any, message: string) {
  await book.save();
  await book.populate("members", PUBLIC_USER_FIELDS);
  broadcastBook(book);
  res.json({ status: true, message, data: serializeBookFor(book, callerId(req)) });
}
export function registerPiggyBankRoutes(app: any) {
  // --- Piggy banks ---------------------------------------------------------
  //
  // Surplus budget set aside toward a future purchase, with its own ledger: unlike a
  // budget, which is measured fresh over each period, its balance accumulates, so "how
  // close am I to the telescope?" has an answer. Every route here answers with the whole
  // book, the way the budget routes do, so one response refreshes the client and one
  // socket broadcast reaches everyone else in the book.

  app.post(
    "/api/xenbudget/books/:bookId/piggy-banks",
    validateParams(xenBudgetBookIdParamSchema),
    validate(createXenBudgetPiggyBankSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const error = validatePiggyBankCategory(req.body, book);
      if (error) throw new AppError(400, error);

      book.piggy_banks.push({
        ...toPiggyBankFields(req.body, book),
        created_by: callerId(req),
      });
      await saveAndRespond(req, res, book, "Piggy bank created");
    },
  );

  app.put(
    "/api/xenbudget/books/:bookId/piggy-banks/:bankId",
    validateParams(xenBudgetPiggyBankParamSchema),
    validate(updateXenBudgetPiggyBankSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const bank = book.piggy_banks.id(req.params.bankId);
      if (!bank) throw new AppError(404, "Piggy bank not found");
      const error = validatePiggyBankCategory(req.body, book);
      if (error) throw new AppError(400, error);

      Object.assign(bank, toPiggyBankFields(req.body, book, bank));
      await saveAndRespond(req, res, book, "Piggy bank updated");
    },
  );

  // Deleting a piggy bank takes its ledger but LEAVES the transactions it created: those are
  // real money movements that already happened, and silently removing a year of them
  // because a target was abandoned would rewrite the book's history.
  app.delete(
    "/api/xenbudget/books/:bookId/piggy-banks/:bankId",
    validateParams(xenBudgetPiggyBankParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const bank = book.piggy_banks.id(req.params.bankId);
      if (!bank) throw new AppError(404, "Piggy bank not found");

      // Counted rather than inferred from the ledger: an item may have been deleted
      // from the Items tab since, and promising to leave one behind that isn't there
      // any more would be a lie in the only message the user gets about it.
      const linkedIds = (bank.contributions || []).map((c: any) => c.item_id).filter(Boolean);
      const kept =
        linkedIds.length === 0
          ? 0
          : await XenBudgetItem.countDocuments({
              _id: { $in: linkedIds },
              book_id: book._id,
            });
      book.piggy_banks.pull({ _id: bank._id });
      await saveAndRespond(
        req,
        res,
        book,
        kept > 0
          ? `Piggy bank deleted — ${kept} transaction${kept === 1 ? "" : "s"} left in the book`
          : "Piggy bank deleted",
      );
    },
  );

  // POST .../piggyBank/:bankId/contributions - put money in, or take it back out
  //
  // `amount` is always positive and `direction` carries the sign, so a "contribute"
  // button can't subtract by sending a minus. The matching book item is always written -
  // see createContributionItem for why it books the way round it does.
  app.post(
    "/api/xenbudget/books/:bookId/piggy-banks/:bankId/contributions",
    validateParams(xenBudgetPiggyBankParamSchema),
    validate(createXenBudgetContributionSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const bank = book.piggy_banks.id(req.params.bankId);
      if (!bank) throw new AppError(404, "Piggy bank not found");

      const userId = callerId(req);
      const magnitude = roundMoney(req.body.amount);
      const out = req.body.direction === "out";
      // A bank that owes money is a balance nobody can act on, so a withdrawal is capped
      // at what is actually in there rather than allowed to go negative.
      if (out && magnitude > summarizePiggyBank(bank).saved) {
        throw new AppError(400, "That's more than this piggy bank holds");
      }
      const date = bookDateToUtc(req.body.date || new Date());

      let item;
      try {
        item = await createContributionItem(book, bank, userId, magnitude, out, date, req.body.note);
      } catch (e: any) {
        throw new AppError(400, e.message);
      }

      bank.contributions.push({
        amount: out ? -magnitude : magnitude,
        date,
        note: req.body.note,
        user_id: userId,
        item_id: item._id,
      });
      await saveAndRespond(req, res, book, out ? "Withdrawn" : "Contribution added");
    },
  );

  // Editing a contribution keeps its linked transaction in step, so the two can never
  // disagree about what moved. Its DIRECTION is fixed: a deposit that becomes a withdrawal
  // is a different movement, and turning one into the other in place would leave the
  // linked item booked the wrong way round.
  app.put(
    "/api/xenbudget/books/:bookId/piggy-banks/:bankId/contributions/:contributionId",
    validateParams(xenBudgetContributionParamSchema),
    validate(updateXenBudgetContributionSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const bank = book.piggy_banks.id(req.params.bankId);
      if (!bank) throw new AppError(404, "Piggy bank not found");
      const contribution = bank.contributions.id(req.params.contributionId);
      if (!contribution) {
        throw new AppError(404, "Contribution not found");
      }

      const out = contribution.amount < 0;
      const magnitude = req.body.amount === undefined ? Math.abs(contribution.amount) : roundMoney(req.body.amount);
      if (out) {
        const otherSaved = summarizePiggyBank(bank).saved + Math.abs(contribution.amount);
        if (magnitude > otherSaved) {
          throw new AppError(400, "That's more than this piggy bank holds");
        }
      }

      contribution.amount = out ? -magnitude : magnitude;
      if (req.body.date !== undefined) contribution.date = bookDateToUtc(req.body.date);
      if (req.body.note !== undefined) contribution.note = req.body.note;

      const item = await linkedItem(book, contribution);
      if (item) {
        item.amount = magnitude;
        item.date = contribution.date;
        item.description = contributionDescription(bank, out, contribution.note);
        item.categories = bank.category ? evenCategoryWeights([bank.category], magnitude) : [];
        item.shares = resolveShares(
          "exact",
          magnitude,
          [{ user_id: contribution.user_id, amount: magnitude }],
          memberIds(book),
        );
        item.manually_edited = true;
        await item.save();
      }

      await saveAndRespond(req, res, book, "Contribution updated");
    },
  );

  // The linked transaction goes with it: it only existed to mirror this contribution, and
  // leaving it behind would double-count the money against the book's spending.
  app.delete(
    "/api/xenbudget/books/:bookId/piggy-banks/:bankId/contributions/:contributionId",
    validateParams(xenBudgetContributionParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const bank = book.piggy_banks.id(req.params.bankId);
      if (!bank) throw new AppError(404, "Piggy bank not found");
      const contribution = bank.contributions.id(req.params.contributionId);
      if (!contribution) {
        throw new AppError(404, "Contribution not found");
      }

      const item = await linkedItem(book, contribution);
      if (item) await XenBudgetItem.deleteOne({ _id: item._id });
      bank.contributions.pull({ _id: contribution._id });
      await saveAndRespond(req, res, book, item ? "Contribution and its transaction removed" : "Contribution removed");
    },
  );

  // GET /api/xenbudget/books/:bookId/budget-status?as_of&currency&from&to
  //
  // What each active budget has spent in the period it is *currently* in. Every budget
  // carries its own anchor and period length, so their windows differ; they're all
  // resolved up front and then measured in one $facet pass over the union range rather
  // than one query per budget.
  //
  // `from`/`to` override that: every budget is measured over the one window instead, which
  // is what a report covering an arbitrary range needs. Only the SPEND changes - `amount`
  // stays each budget's own per-period figure, and scaling it to the range is the client's
  // job (see scaleBudgetToRange), so that date maths lives in exactly one place.
  app.get(
    "/api/xenbudget/books/:bookId/budget-status",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      // memberById below needs real User docs, not raw ObjectIds.
      await book.populate("members", PUBLIC_USER_FIELDS);
      const q = req.query as Record<string, string>;
      const asOf = q.as_of ? new Date(q.as_of) : new Date();
      const currency = q.currency || book.default_currency;

      const budgets = book.budgets.filter((b: any) => b.active !== false);
      if (budgets.length === 0) {
        return res.json({
          status: true,
          message: "No budgets",
          data: { as_of: asOf.toISOString(), currency, budgets: [] },
        });
      }

      const rangeFrom = q.from ? new Date(q.from) : null;
      const rangeTo = q.to ? new Date(q.to) : null;
      const useRange =
        !!rangeFrom &&
        !!rangeTo &&
        !isNaN(rangeFrom.getTime()) &&
        !isNaN(rangeTo.getTime()) &&
        rangeTo.getTime() > rangeFrom.getTime();

      // How many of each budget's own past periods to measure, for the history strip.
      // Opt-in and clamped: it widens the scan from one period to `history` of them, and
      // the Overview polls this endpoint often enough that every caller should not pay
      // for a year of history it isn't drawing.
      const history = Math.min(24, Math.max(0, parseInt(q.history, 10) || 0));

      // Each budget's own current-period window, always computed so the response can
      // carry "whole period" figures alongside whatever range the caller asked for.
      const ownRanges = budgets.map((b: any) => budgetPeriodRange(b, asOf));
      // Oldest first, ending with the window `asOf` is in. Empty when history wasn't
      // asked for, or for a one-off budget, which has no repeating window to look back
      // over.
      const historyRanges = budgets.map((b: any) => previousPeriodRanges(b, asOf, history));
      const ranges = budgets.map((_b: any, i: number) =>
        useRange ? { from: rangeFrom as Date, to: rangeTo as Date } : ownRanges[i],
      );
      // The base match has to cover both the requested window and each budget's own
      // period, or a whole-period bar would be clipped to the requested range.
      // History windows go into the union too, or the base $match below clips them and
      // every bucket comes back empty.
      const union = [...(useRange ? [...ranges, ...ownRanges] : ranges), ...historyRanges.flat()];
      const unionFrom = new Date(Math.min(...union.map((r: any) => r.from.getTime())));
      const unionTo = new Date(Math.max(...union.map((r: any) => r.to.getTime())));

      // Both types are in scope here because different budgets in one book measure
      // different things; each branch below narrows to its own. Widening the shared match
      // is what lets an expense cap and an income target sit on the same category without
      // either counting the other's items.
      const base = {
        book_id: book._id,
        currency,
        flags: { $nin: [FLAG_OFF_BUDGET] },
        date: { $gte: unionFrom, $lt: unionTo },
      };

      const facet: Record<string, any[]> = {};
      budgets.forEach((b: any, i: number) => {
        const r = ranges[i];
        // `to` is exclusive: the instant a period ends is the instant the next begins,
        // so $lt (not $lte) keeps a boundary item from being counted twice.
        const inPeriod = { date: { $gte: r.from, $lt: r.to } };
        const cats = b.categories && b.categories.length > 0 ? b.categories : null;

        // What this budget's SCOPE counts of each item: the whole thing when it names no
        // categories, otherwise only the weights of the ones it does name.
        //
        // A budget over NAMED categories counts both directions and nets them: money
        // that came back into one of those categories - a refund, a repayment, a
        // transfer reversed - is not spending, and counting only the outgoing half left
        // a category that had been paid back in full sitting at its cap.
        //
        // A budget naming NO categories keeps the single-type narrowing, ahead of the
        // unwind so an income budget never fans out the expense rows it is about to
        // discard. Salary is not a refund of a whole-book cap.
        const counted = itemTypeFor(b.measures);
        const signed = (expr: any): any => ({
          $cond: [{ $eq: ["$type", counted] }, expr, { $multiply: [-1, expr] }],
        });
        const scopeStages: any[] = cats
          ? [{ $unwind: "$categories" }, { $match: { "categories.name": { $in: cats } } }]
          : [{ $match: { type: counted } }];
        const scopeAmount: any = cats ? signed("$categories.amount") : "$amount";
        // One person's slice of that scope: their share of the item, prorated by the
        // category weight. A $100 item split 70/30 by category and 50/50 by person owes
        // a Groceries budget $35 - 50% of the $70 weight, not $70 and not $100.
        const personAmount: any = cats
          ? signed({
              $cond: [
                { $eq: ["$amount", 0] },
                0,
                { $divide: [{ $multiply: ["$categories.amount", "$shares.amount"] }, "$amount"] },
              ],
            })
          : "$shares.amount";

        // The scope's own spend, computed whether or not there is an overall limit to
        // measure it against: a budget that only caps named people still has a total,
        // and the detail panel shows it. Grouping by item _id first keeps item_count
        // from inflating when one item carries two of the selected categories.
        facet[`b${i}`] = [
          { $match: inPeriod },
          ...scopeStages,
          ...(cats ? [{ $group: { _id: "$_id", total: { $sum: scopeAmount } } }] : []),
          { $group: { _id: null, total: { $sum: cats ? "$total" : scopeAmount }, count: { $sum: 1 } } },
        ];

        // The same scope over the budget's OWN current period, not the requested range
        // - the "whole period" bar. When no range is requested the two coincide.
        facet[`b${i}full`] = [
          { $match: { date: { $gte: ownRanges[i].from, $lt: ownRanges[i].to } } },
          ...scopeStages,
          ...(cats ? [{ $group: { _id: "$_id", total: { $sum: scopeAmount } } }] : []),
          { $group: { _id: null, total: { $sum: cats ? "$total" : scopeAmount }, count: { $sum: 1 } } },
        ];

        // Who spent it. Every member's shares add up to the item amount, so these rows
        // sum back to the scope total above rather than telling a different story.
        facet[`b${i}p`] = [
          { $match: inPeriod },
          ...scopeStages,
          { $unwind: "$shares" },
          { $group: { _id: "$shares.user_id", total: { $sum: personAmount } } },
          { $sort: { total: -1 } },
        ];

        // The same breakdown over the budget's OWN current period, for the whole-period
        // section's "who spent it".
        facet[`b${i}fullp`] = [
          { $match: { date: { $gte: ownRanges[i].from, $lt: ownRanges[i].to } } },
          ...scopeStages,
          { $unwind: "$shares" },
          { $group: { _id: "$shares.user_id", total: { $sum: personAmount } } },
          { $sort: { total: -1 } },
        ];

        // The same scope over each of the budget's own past periods, in one pass.
        // $bucket on the window boundaries rather than a $dateToString key: "%Y-%m" has
        // no quarterly form, and folding months into quarters in JS afterwards is
        // exactly where this would drift out of step with the figures above it.
        const hist = historyRanges[i];
        if (hist.length > 0) {
          facet[`b${i}h`] = [
            { $match: { date: { $gte: hist[0].from, $lt: hist[hist.length - 1].to } } },
            ...scopeStages,
            ...(cats ? [{ $group: { _id: "$_id", date: { $first: "$date" }, total: { $sum: scopeAmount } } }] : []),
            {
              $bucket: {
                groupBy: "$date",
                boundaries: [...hist.map((r: any) => r.from), hist[hist.length - 1].to],
                default: "other",
                output: { total: { $sum: cats ? "$total" : scopeAmount }, count: { $sum: 1 } },
              },
            },
          ];
        }

        // One pipeline per per-person limit. Same scope, same window - the nesting is
        // what guarantees a sub-limit is measured over exactly the parent's items.
        (b.sub_budgets || []).forEach((sub: any, j: number) => {
          facet[`b${i}s${j}`] = [
            { $match: inPeriod },
            ...scopeStages,
            { $unwind: "$shares" },
            { $match: { "shares.user_id": sub.person_id } },
            { $group: { _id: "$_id", total: { $sum: personAmount } } },
            { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
          ];
        });
      });
      const [results] = await XenBudgetItem.aggregate([{ $match: base }, { $facet: facet }]);

      const memberById = new Map<string, any>();
      (book.members as any[]).forEach((m: any) => {
        if (m._id) memberById.set(m._id.toString(), m);
      });

      res.json({
        status: true,
        message: "Budget status retrieved",
        data: {
          as_of: asOf.toISOString(),
          currency,
          budgets: budgets.map((b: any, i: number) => {
            const row = results?.[`b${i}`]?.[0];
            const spent = roundMoney(row?.total || 0);
            const periodRow = results?.[`b${i}full`]?.[0];
            const periodSpent = roundMoney(periodRow?.total || 0);
            // Absent when the budget caps only named people. The client keys every
            // "is there an overall bar to draw" decision off this being undefined,
            // which is why it isn't flattened to 0.
            const amount = b.amount == null ? undefined : roundMoney(b.amount);
            return {
              _id: b._id.toString(),
              categories: b.categories || [],
              // The numbers below are the same either way - `over` means literally
              // "past the amount". Whether that is a failure or the point of the
              // budget is the client's call, and this is what it decides on.
              measures: normalizeMeasures(b.measures),
              period: b.period,
              spent,
              item_count: row?.count || 0,
              period_spent: periodSpent,
              period_item_count: periodRow?.count || 0,
              ...(amount === undefined
                ? {}
                : {
                    amount,
                    remaining: roundMoney(amount - spent),
                    // Uncapped rather than clamped, so the bar can show how far over it went.
                    percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
                    over: spent > amount,
                  }),
              by_person: (results?.[`b${i}p`] || [])
                .filter((p: any) => p._id)
                .map((p: any) => ({
                  user_id: p._id,
                  username: memberById.get(p._id)?.username || "Unknown",
                  amount: roundMoney(p.total || 0),
                })),
              period_by_person: (results?.[`b${i}fullp`] || [])
                .filter((p: any) => p._id)
                .map((p: any) => ({
                  user_id: p._id,
                  username: memberById.get(p._id)?.username || "Unknown",
                  amount: roundMoney(p.total || 0),
                })),
              sub_budgets: (b.sub_budgets || []).map((sub: any, j: number) => {
                const subRow = results?.[`b${i}s${j}`]?.[0];
                const subSpent = roundMoney(subRow?.total || 0);
                const subAmount = roundMoney(sub.amount);
                return {
                  _id: sub._id.toString(),
                  person_id: sub.person_id,
                  person_name: memberById.get(sub.person_id)?.username || "Unknown",
                  amount: subAmount,
                  spent: subSpent,
                  remaining: roundMoney(subAmount - subSpent),
                  percent: subAmount > 0 ? Math.round((subSpent / subAmount) * 100) : 0,
                  over: subSpent > subAmount,
                  item_count: subRow?.count || 0,
                };
              }),
              period_from: ranges[i].from.toISOString(),
              period_to: ranges[i].to.toISOString(),
              own_period_from: ownRanges[i].from.toISOString(),
              own_period_to: ownRanges[i].to.toISOString(),
              // One entry per own-period, oldest first. Absent entirely unless history
              // was asked for, so the default response is byte-identical to before.
              // These figures are per whole period and are never scaled to a requested
              // range - a column means "that month", whatever window is on screen.
              ...(historyRanges[i].length === 0
                ? {}
                : {
                    periods: historyRanges[i].map((r: any) => {
                      // $bucket keys each bucket by its lower boundary and omits empty ones
                      // entirely, so a month with no items has to be filled back in as a
                      // zero rather than shifting every later column left.
                      const bucket = (results?.[`b${i}h`] || []).find(
                        (row: any) => row._id instanceof Date && row._id.getTime() === r.from.getTime(),
                      );
                      const periodSpentHere = roundMoney(bucket?.total || 0);
                      return {
                        from: r.from.toISOString(),
                        to: r.to.toISOString(),
                        spent: periodSpentHere,
                        item_count: bucket?.count || 0,
                        ...(amount === undefined
                          ? {}
                          : {
                              amount,
                              percent: amount > 0 ? Math.round((periodSpentHere / amount) * 100) : 0,
                              over: periodSpentHere > amount,
                            }),
                      };
                    }),
                  }),
            };
          }),
        },
      });
    },
  );
}
