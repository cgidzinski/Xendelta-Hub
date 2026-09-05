import type { XenBudgetPiggyBank, PiggyBankStatus } from "../../../../../hooks/xenbudget/types";

/**
 * How a piggy bank is doing, and in what order banks are worth reading.
 *
 * The balance itself is NOT computed here: the server sends `saved` on every bank, and the
 * books-list payload omits the ledger entirely, so a client that summed contributions for
 * itself would report every bank on that screen as empty. This module only turns the
 * server's figure into the things a card shows.
 */

export interface BankProgress {
    /** What is still owed to the target. Negative once the bank is past it. */
    remaining: number;
    /** Uncapped, so 130 really means 130 - the bar relies on that to draw the overflow. */
    percent: number;
    /** Whether the target has been reached, whatever the bank's status says. */
    reached: boolean;
}

export function bankProgress(saved: number, target: number): BankProgress {
    // A target of zero would make every percentage infinite. It can't be stored (the
    // schema requires a positive amount), but a bank is still either funded or not.
    const percent = target > 0 ? Math.round((saved / target) * 100) : (saved > 0 ? 100 : 0);
    return {
        remaining: Math.round((target - saved) * 100) / 100,
        percent,
        reached: saved >= target && target > 0,
    };
}

/**
 * The line under a bank's bar.
 *
 * Deliberately NOT budgetKind's limitCaption, which the bank cards used to call with
 * kind="bank". That function serves the budget floor as well, and the two want different
 * nouns: a floor on a category is a MINIMUM, a floor on a named fund is a TARGET. Sharing
 * one formatter meant renaming the budget's wording silently retitled these cards. The
 * direction logic (limitState, limitColor, BudgetBar) is still shared - it is the words
 * that are not common, not the maths.
 */
export function bankCaption(
    remaining: number, percent: number, money: (v: number) => string,
): string {
    return remaining > 0
        ? `${money(remaining)} to go · ${percent}%`
        : `${money(-remaining)} past target · ${percent}%`;
}

/** Active first, then completed, then archived - a finished bank isn't what you came for. */
const STATUS_ORDER: Record<PiggyBankStatus, number> = { active: 0, completed: 1, archived: 2 };

/**
 * Nearest to done first, inside each status band.
 *
 * The opposite of how budgets sort, and deliberately: a budget list leads with what is in
 * trouble, but nothing is *wrong* with a bank that has barely started - the one about to
 * land is the one worth seeing. Ties break on name so the order is stable between renders
 * rather than reshuffling every time money moves.
 */
export function sortPiggyBanks(banks: XenBudgetPiggyBank[]): XenBudgetPiggyBank[] {
    return [...banks].sort((a, b) => {
        const byStatus = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
        if (byStatus !== 0) return byStatus;
        const byProgress = bankProgress(b.saved, b.target_amount).percent
            - bankProgress(a.saved, a.target_amount).percent;
        if (byProgress !== 0) return byProgress;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

export interface BankTotals {
    saved: number;
    target: number;
    activeCount: number;
    completedCount: number;
}

/**
 * The header figures, over ACTIVE banks only.
 *
 * A completed bank's target would otherwise sit in the total forever, so the strip would
 * read "$4,000 of $60,000" for someone who has finished five of six banks.
 *
 * Summing across banks is safe because every bank in a book is denominated in the book's
 * currency - it is stamped from `default_currency` and never picked per bank.
 */
export function bankTotals(banks: XenBudgetPiggyBank[]): BankTotals {
    let saved = 0;
    let target = 0;
    let activeCount = 0;
    let completedCount = 0;
    for (const bank of banks) {
        if (bank.status === "completed") completedCount += 1;
        if (bank.status !== "active") continue;
        activeCount += 1;
        saved += bank.saved;
        target += bank.target_amount;
    }
    return {
        saved: Math.round(saved * 100) / 100,
        target: Math.round(target * 100) / 100,
        activeCount,
        completedCount,
    };
}
