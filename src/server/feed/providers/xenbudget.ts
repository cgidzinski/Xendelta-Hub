import { XenBudgetBook, XenBudgetItem } from "../../models/xenBudget";
import { budgetPeriodRange } from "../../utils/xenBudgetUtils";
import { formatMoney } from "@shared/money";
import type { AttentionCard } from "@shared/feed";
import type { AttentionProvider } from "./types";

const WARN_AT = 0.9;
const MAX_CARDS = 4;

/** Spending budgets (the ones with an overall limit) that are at 90% or past it this period. */
export const budgetProvider: AttentionProvider = {
  key: "xenbudget",
  async fetch(userId) {
    const books = await XenBudgetBook.find({ members: userId, archived: { $ne: true } }).lean();
    const now = new Date();
    const found: (AttentionCard & { ratio: number })[] = [];

    for (const book of books as any[]) {
      for (const budget of book.budgets ?? []) {
        if (budget.active === false || (budget.measures ?? "expense") !== "expense" || !budget.amount) continue;
        const range = budgetPeriodRange(budget, now);
        const names: string[] = budget.categories ?? [];
        const match: Record<string, unknown> = {
          book_id: book._id,
          type: "expense",
          currency: book.default_currency,
          date: { $gte: range.from, $lt: range.to },
          flags: { $ne: "Off budget" },
        };
        const pipeline: any[] = [{ $match: match }];
        if (names.length) {
          pipeline.push(
            { $unwind: "$categories" },
            { $match: { "categories.name": { $in: names } } },
            { $group: { _id: null, spent: { $sum: { $ifNull: ["$categories.amount", "$amount"] } } } },
          );
        } else {
          pipeline.push({ $group: { _id: null, spent: { $sum: "$amount" } } });
        }
        const [row] = await XenBudgetItem.aggregate<{ spent: number }>(pipeline);
        const spent = row?.spent ?? 0;
        const ratio = spent / budget.amount;
        if (ratio < WARN_AT) continue;
        const over = ratio >= 1;
        const label = names.length ? names.join(", ") : "Overall";
        found.push({
          key: `xenbudget:${book._id}:${budget._id}`,
          app: "xenbudget",
          severity: over ? "critical" : "warning",
          title: `${label} is ${over ? "over" : "at"} ${Math.round(ratio * 100)}% of budget`,
          subtitle: `${book.name} · ${formatMoney(spent, book.default_currency)} of ${formatMoney(budget.amount, book.default_currency)}`,
          link: `/internal/xenbudget`,
          count: 1,
          ratio,
        });
      }
    }
    found.sort((a, b) => b.ratio - a.ratio);
    const cards = found.slice(0, MAX_CARDS).map(({ ratio: _ratio, ...card }) => card);
    if (found.length > MAX_CARDS) cards[cards.length - 1].count += found.length - MAX_CARDS;
    return cards;
  },
};
