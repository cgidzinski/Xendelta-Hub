import { Request, Response } from "express";
import { XenBudgetItem } from "../../models/xenBudget";
import { User } from "../../models/user";
import { validateParams, xenBudgetBookIdParamSchema } from "../../utils/validation";
import { roundMoney, seedPeriods } from "../../utils/xenBudgetUtils";

import { detectRecurring, monthlyCommitted, normalizeMerchant } from "../../utils/xenBudgetRecurring";
import { coverageByMerchant } from "../../utils/xenBudgetCoverage";
import { baseItemMatch, loadBookForMember, mongoose, plainRules, toDraft } from "./shared";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../../utils/publicUser";

// How far back recurring detection and the merchant rollup look when the caller doesn't
// say. Long enough to see a yearly renewal repeat, short enough that a decade-old book
// doesn't scan its whole history to answer "what do I pay every month".
const DEFAULT_RECURRING_LOOKBACK_MONTHS = 18;

const MAX_RECURRING_LOOKBACK_MONTHS = 60;

// A ceiling on the rows either analysis will pull into memory. Both read a lean
// projection (five small fields), so this is a few MB at worst.
const MAX_ANALYSIS_ITEMS = 20000;

// Past this many merchants a list stops being something anyone reads.
const DEFAULT_MERCHANT_LIMIT = 25;

const MAX_MERCHANT_LIMIT = 200;
export function registerSummaryRoutes(app: any) {
  // --- Summary -------------------------------------------------------------

  // GET /api/xenbudget/books/:bookId/summary?from&to&group_by=month|week|day&currency
  //
  // The engine behind both the live tally and the report page. One $facet pass, so the
  // per-period, per-category, per-person and top-line numbers are computed over exactly the
  // same set of items and always reconcile with each other.
  app.get(
    "/api/xenbudget/books/:bookId/summary",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;
        const people = q.people ? q.people.split(",").filter(Boolean) : null;

        // Amounts in different currencies can't be added together, so a summary is always
        // scoped to one - the same thing XenSplit's analytics does. The full list of
        // currencies present comes back too, so the UI can offer a switcher rather than
        // silently hiding money.
        const currencies: string[] = await XenBudgetItem.distinct("currency", { book_id: book._id });
        const currency =
          q.currency && currencies.includes(q.currency)
            ? q.currency
            : currencies.includes(book.default_currency)
              ? book.default_currency
              : currencies[0];

        const groupBy = q.group_by === "day" ? "day" : q.group_by === "week" ? "week" : "month";
        const format = groupBy === "day" ? "%Y-%m-%d" : groupBy === "week" ? "%G-W%V" : "%Y-%m";

        // Default window: the current UTC month.
        const now = new Date();
        const from = q.from ? new Date(q.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const to = q.to ? new Date(q.to) : now;

        const matchQuery: Record<string, string> = { ...q, currency, from: from.toISOString(), to: to.toISOString() };
        // Handled explicitly below: when narrowing to people, the rollups sum each selected
        // person's share rather than the item's full amount.
        delete matchQuery.people;
        const match = baseItemMatch(book._id, matchQuery);

        const expenseOnly = { $match: { type: "expense" } };

        // Narrowing to specific people changes what each document contributes: instead of
        // the item's full amount, the rollups sum each selected person's actual share.
        const shareStages: any[] = people
          ? [{ $unwind: "$shares" }, { $match: { "shares.user_id": { $in: people } } }]
          : [];
        const amountField: any = people ? "$shares.amount" : "$amount";
        // A person's share of one category weight: share × (category weight ÷ item amount).
        const categoryTotalExpr: any = people
          ? {
              $cond: [
                { $eq: ["$amount", 0] },
                0,
                { $divide: [{ $multiply: ["$shares.amount", "$categories.amount"] }, "$amount"] },
              ],
            }
          : "$categories.amount";

        const [facets] = currency
          ? await XenBudgetItem.aggregate([
              { $match: match },
              ...shareStages,
              {
                $facet: {
                  byPeriod: [
                    {
                      $group: {
                        _id: { $dateToString: { format, date: "$date" } },
                        expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, amountField, 0] } },
                        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, amountField, 0] } },
                        count: { $sum: 1 },
                      },
                    },
                    { $sort: { _id: 1 } },
                  ],
                  // Sums the category's WEIGHT (or the selected person's share of it), not the
                  // item's full amount. Unwinding and summing $amount - which is what the old
                  // tags array did - counts an item once per label, so anything carrying two of
                  // them inflated the totals.
                  //
                  // Both directions are counted, kept apart: money that came back INTO a named
                  // category (a refund, a repayment, an internal transfer) offsets what went out
                  // of it, and a rollup that only ever saw expenses reported the gross outgoings
                  // of a category that had been paid back in full. `total` stays gross so the
                  // charts that can't draw a negative slice keep working; the client nets.
                  byCategory: [
                    { $unwind: "$categories" },
                    {
                      $group: {
                        _id: "$categories.name",
                        total: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, categoryTotalExpr, 0] } },
                        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, categoryTotalExpr, 0] } },
                        count: { $sum: 1 },
                      },
                    },
                    { $sort: { total: -1 } },
                  ],
                  byPerson: [
                    { $unwind: "$shares" },
                    {
                      $group: {
                        _id: "$shares.user_id",
                        total: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$shares.amount", 0] } },
                        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$shares.amount", 0] } },
                        count: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, 1, 0] } },
                      },
                    },
                    { $sort: { total: -1 } },
                  ],
                  // The same two rollups again, but cut by period as well as category - what
                  // the report's month-by-month grid is built from. Kept as their own facets
                  // rather than derived on the client, because only the server can weight a
                  // split purchase correctly, and re-deriving it from the flat by_category
                  // rows is impossible: those have already been summed across time.
                  byCategoryPeriod: [
                    { $unwind: "$categories" },
                    {
                      $group: {
                        _id: {
                          category: "$categories.name",
                          period: { $dateToString: { format, date: "$date" } },
                        },
                        total: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, categoryTotalExpr, 0] } },
                        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, categoryTotalExpr, 0] } },
                      },
                    },
                  ],
                  // Deliberately still expense-only, unlike the two facets above: netting is
                  // something a category opts into by being NAMED. An uncategorised paycheque
                  // is not a refund of uncategorised spending, and letting it offset one would
                  // swamp the row with salary.
                  uncategorised: [
                    expenseOnly,
                    { $match: { $or: [{ categories: { $size: 0 } }, { categories: { $exists: false } }] } },
                    { $group: { _id: null, total: { $sum: amountField }, count: { $sum: 1 } } },
                  ],
                  uncategorisedByPeriod: [
                    expenseOnly,
                    { $match: { $or: [{ categories: { $size: 0 } }, { categories: { $exists: false } }] } },
                    {
                      $group: {
                        _id: { $dateToString: { format, date: "$date" } },
                        total: { $sum: amountField },
                      },
                    },
                  ],
                  totals: [
                    {
                      $group: {
                        _id: null,
                        expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, amountField, 0] } },
                        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, amountField, 0] } },
                        count: { $sum: 1 },
                      },
                    },
                  ],
                },
              },
            ])
          : [null];

        const byPeriodRaw: any[] = facets?.byPeriod ?? [];
        const byCategory: any[] = facets?.byCategory ?? [];
        const byPersonRaw: any[] = facets?.byPerson ?? [];
        const totalsRow = facets?.totals?.[0];
        const uncategorisedRow = facets?.uncategorised?.[0];

        // Resolve usernames in JS with one batched query rather than a $lookup, matching
        // the same approach as elsewhere.
        const personIds = byPersonRaw.map((r: any) => r._id).filter(Boolean);
        const userMap = new Map<string, any>();
        if (personIds.length > 0) {
          const users = await User.find({
            _id: { $in: personIds.filter((id: string) => mongoose.Types.ObjectId.isValid(id)) },
          })
            .select(PUBLIC_USER_FIELDS)
            .lean();
          users.forEach((u: any) => userMap.set(u._id.toString(), u));
        }

        res.json({
          status: true,
          message: "Summary retrieved",
          data: {
            from: from.toISOString(),
            to: to.toISOString(),
            group_by: groupBy,
            currency: currency ?? book.default_currency,
            currencies,
            by_period: seedPeriods(from, to, groupBy).map((key) => {
              const row = byPeriodRaw.find((r: any) => r._id === key);
              const expense = roundMoney(row?.expense || 0);
              const income = roundMoney(row?.income || 0);
              return { key, expense, income, net: roundMoney(income - expense), count: row?.count || 0 };
            }),
            // `total` is what went OUT of the category, `income` what came back in. Kept
            // apart rather than pre-netted: a pie or a stacked area can't draw a negative
            // slice, so the charts read the gross and the figures read the difference.
            by_category: byCategory.map((r: any) => ({
              category: r._id,
              total: roundMoney(r.total),
              income: roundMoney(r.income || 0),
              count: r.count,
            })),
            by_category_period: (facets?.byCategoryPeriod ?? []).map((r: any) => ({
              category: r._id.category,
              key: r._id.period,
              total: roundMoney(r.total),
              income: roundMoney(r.income || 0),
            })),
            uncategorised_by_period: (facets?.uncategorisedByPeriod ?? []).map((r: any) => ({
              key: r._id,
              total: roundMoney(r.total),
            })),
            by_person: byPersonRaw.map((r: any) => ({
              user_id: r._id,
              username: userMap.get(r._id)?.username || "Unknown",
              avatar: userMap.get(r._id)?.avatar || null,
              cosmetics: cosmeticsOf(userMap.get(r._id)),
              total: roundMoney(r.total),
              income: roundMoney(r.income),
              count: r.count,
            })),
            uncategorised: { total: roundMoney(uncategorisedRow?.total || 0), count: uncategorisedRow?.count || 0 },
            totals: {
              expense: roundMoney(totalsRow?.expense || 0),
              income: roundMoney(totalsRow?.income || 0),
              net: roundMoney((totalsRow?.income || 0) - (totalsRow?.expense || 0)),
              count: totalsRow?.count || 0,
            },
          },
        });
      } catch (error) {
        console.error("Error building summary:", error);
        res.status(500).json({ status: false, message: "Failed to build summary" });
      }
    },
  );

  // --- Derived from history -------------------------------------------------

  /**
   * The window and currency both analyses below share.
   *
   * Currency is resolved exactly the way /summary resolves it: amounts in different
   * currencies can't be clustered or added, so each analysis is scoped to one. Returns
   * null when the book holds nothing at all, which both callers answer as an empty result
   * rather than an error.
   */
  async function analysisScope(book: any, q: Record<string, string>, defaultMonths: number) {
    const currencies: string[] = await XenBudgetItem.distinct("currency", { book_id: book._id });
    if (currencies.length === 0) return null;
    const currency =
      q.currency && currencies.includes(q.currency)
        ? q.currency
        : currencies.includes(book.default_currency)
          ? book.default_currency
          : currencies[0];

    const to = q.to ? new Date(q.to) : new Date();
    let from: Date;
    if (q.from) {
      from = new Date(q.from);
    } else {
      const months = Math.min(MAX_RECURRING_LOOKBACK_MONTHS, Math.max(1, Number(q.lookback_months) || defaultMonths));
      from = new Date(to);
      from.setUTCMonth(from.getUTCMonth() - months);
    }
    return { currency, currencies, from, to };
  }

  /**
   * The rows both analyses read, each paired with the merchant it belongs to.
   *
   * Goes through baseItemMatch so "Off budget" stays excluded here exactly as it is
   * everywhere else — a row deliberately set aside must not come back as a subscription.
   * The { book_id, date } index covers this.
   *
   * The merchant is resolved ONCE, here, from the PRE-RULE text. Both matter:
   *   - once, because normalizeMerchant is real string work and both analyses plus the
   *     rule-coverage pass would otherwise each redo it over every row;
   *   - pre-rule, because a rule's set_description rewrite is a tidy-up for humans, and
   *     grouping on it would hide who was actually paid. It is also the text the rules
   *     engine itself sees on a fresh import (stripRuleEffects restores it), so a merchant
   *     name means the same thing to the recurring card, the merchant list, the items
   *     filter and the coverage check.
   */
  async function analysisRows(
    book: any,
    scope: { currency: string; from: Date; to: Date },
  ): Promise<{ item: any; merchant: string }[]> {
    const match = baseItemMatch(book._id, {
      currency: scope.currency,
      from: scope.from.toISOString(),
      to: scope.to.toISOString(),
      type: "expense",
    });
    // Wider than the two rollups strictly need: the coverage pass runs the real rules
    // engine, and a condition can test type, flags, category, source or date. A projection
    // that omitted them would silently evaluate rules against half an item.
    const items = await XenBudgetItem.find(match)
      .select(
        "date amount type description original_description categories flags " +
          "category_split_type rule_categories rule_flags applied_rule_ids source",
      )
      .sort({ date: -1 })
      .limit(MAX_ANALYSIS_ITEMS)
      .lean();

    return (items as any[]).map((item) => ({
      item,
      merchant: normalizeMerchant(item.original_description || item.description || ""),
    }));
  }

  // GET /api/xenbudget/books/:bookId/recurring?currency&lookback_months&from&to
  //
  // Subscriptions and bills, derived from what has already been imported. Read-only: the
  // real transactions keep arriving by CSV, so generating occurrences of our own would
  // only double-count them.
  app.get(
    "/api/xenbudget/books/:bookId/recurring",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;

        const scope = await analysisScope(book, q, DEFAULT_RECURRING_LOOKBACK_MONTHS);
        if (!scope) {
          return res.json({
            status: true,
            message: "Recurring charges retrieved",
            data: {
              currency: book.default_currency,
              currencies: [],
              from: null,
              to: null,
              series: [],
              monthly_committed: 0,
            },
          });
        }

        const rows = await analysisRows(book, scope);
        // `now` is passed in rather than read inside the detector, so every status in one
        // response is measured against the same instant.
        //
        // The detector normalises the description itself; handing it the same PRE-RULE text
        // analysisRows keyed on is what makes a series' merchant name identical to the one
        // on the merchant list and in the items filter.
        const series = detectRecurring(
          rows.map(({ item }) => ({
            date: item.date,
            amount: item.amount,
            description: item.original_description || item.description || "",
            categories: item.categories || [],
          })),
          new Date(),
        );

        // Composed here rather than inside detectRecurring: that module is pure and knows
        // nothing about rules, and it should stay that way.
        const seriesMerchants = new Set(series.map((s) => s.merchant));
        const coverage = coverageByMerchant(
          rows
            .filter((r) => seriesMerchants.has(r.merchant))
            .map(({ merchant, item }) => ({ merchant, draft: toDraft(item) })),
          plainRules(book),
        );

        res.json({
          status: true,
          message: "Recurring charges retrieved",
          data: {
            currency: scope.currency,
            currencies: scope.currencies,
            from: scope.from.toISOString(),
            to: scope.to.toISOString(),
            series: series.map((s) => ({ ...s, rule_coverage: coverage.get(s.merchant) })),
            monthly_committed: monthlyCommitted(series),
          },
        });
      } catch (error) {
        console.error("Error detecting recurring charges:", error);
        res.status(500).json({ status: false, message: "Failed to detect recurring charges" });
      }
    },
  );

  // GET /api/xenbudget/books/:bookId/merchants?currency&from&to&limit
  //
  // Where the money actually went. Category answers "what kind of spending"; this answers
  // "who was paid", which is the question a rule gets written from.
  app.get(
    "/api/xenbudget/books/:bookId/merchants",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;

        const limit = Math.min(MAX_MERCHANT_LIMIT, Math.max(1, Number(q.limit) || DEFAULT_MERCHANT_LIMIT));
        const scope = await analysisScope(book, q, DEFAULT_RECURRING_LOOKBACK_MONTHS);
        if (!scope) {
          return res.json({
            status: true,
            message: "Merchants retrieved",
            data: {
              currency: book.default_currency,
              currencies: [],
              from: null,
              to: null,
              merchants: [],
              total: 0,
              merchant_count: 0,
            },
          });
        }

        const rows = await analysisRows(book, scope);

        // Grouped in JS rather than in an aggregation pipeline: normalizeMerchant is real
        // string logic (stacked processor prefixes, reference numbers), not something
        // $regexReplace should be asked to reproduce — and keeping ONE implementation is
        // what lets a merchant row and a recurring series agree on what a merchant is.
        interface MerchantGroup {
          merchant: string;
          total: number;
          count: number;
          last_date: Date;
          sample_description: string;
          categories: string[];
        }
        const groups = new Map<string, MerchantGroup>();
        let total = 0;

        for (const { item, merchant } of rows) {
          if (!merchant) continue;
          total += item.amount || 0;

          const existing = groups.get(merchant);
          const group: MerchantGroup = existing ?? {
            merchant,
            total: 0,
            count: 0,
            // Items arrive newest first, so the first one seen is the most recent.
            last_date: item.date,
            // The pre-rule text, so the row can show what this looks like on a statement.
            sample_description: item.original_description || item.description || "",
            categories: [],
          };
          group.total += item.amount || 0;
          group.count += 1;
          for (const category of item.categories || []) {
            if (category?.name && !group.categories.includes(category.name)) {
              group.categories.push(category.name);
            }
          }
          if (!existing) groups.set(merchant, group);
        }

        const ranked = [...groups.values()].sort((a, b) => b.total - a.total);
        const page = ranked.slice(0, limit);

        // Only the merchants actually being returned: running the rules engine over every
        // row of a long book to answer a question about 25 rows would be waste. Ranking has
        // to finish first, so this can't fold into the grouping pass above.
        const shown = new Set(page.map((g) => g.merchant));
        const coverage = coverageByMerchant(
          rows.filter((r) => shown.has(r.merchant)).map(({ merchant, item }) => ({ merchant, draft: toDraft(item) })),
          plainRules(book),
        );

        res.json({
          status: true,
          message: "Merchants retrieved",
          data: {
            currency: scope.currency,
            currencies: scope.currencies,
            from: scope.from.toISOString(),
            to: scope.to.toISOString(),
            // The full count, so the UI can say what the tail it isn't showing amounts to.
            merchant_count: ranked.length,
            total: roundMoney(total),
            merchants: page.map((g) => ({
              merchant: g.merchant,
              sample_description: g.sample_description,
              total: roundMoney(g.total),
              count: g.count,
              average: roundMoney(g.total / g.count),
              last_date: new Date(g.last_date).toISOString(),
              categories: g.categories,
              rule_coverage: coverage.get(g.merchant),
            })),
          },
        });
      } catch (error) {
        console.error("Error building merchant rollup:", error);
        res.status(500).json({ status: false, message: "Failed to build merchant rollup" });
      }
    },
  );
}
