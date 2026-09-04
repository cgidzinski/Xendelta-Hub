import type { XenBudgetSavingsGoal, GoalStatus } from "../../../../../hooks/xenbudget/types";

/**
 * How a savings goal is doing, and in what order goals are worth reading.
 *
 * The balance itself is NOT computed here: the server sends `saved` on every goal, and the
 * books-list payload omits the ledger entirely, so a client that summed contributions for
 * itself would report every goal on that screen as empty. This module only turns the
 * server's figure into the things a card shows.
 */

export interface GoalProgress {
    /** What is still owed to the target. Negative once the goal is past it. */
    remaining: number;
    /** Uncapped, so 130 really means 130 - the bar relies on that to draw the overflow. */
    percent: number;
    /** Whether the target has been reached, whatever the goal's status says. */
    reached: boolean;
}

export function goalProgress(saved: number, target: number): GoalProgress {
    // A target of zero would make every percentage infinite. It can't be stored (the
    // schema requires a positive amount), but a goal is still either funded or not.
    const percent = target > 0 ? Math.round((saved / target) * 100) : (saved > 0 ? 100 : 0);
    return {
        remaining: Math.round((target - saved) * 100) / 100,
        percent,
        reached: saved >= target && target > 0,
    };
}

/** Active first, then completed, then archived - a finished goal isn't what you came for. */
const STATUS_ORDER: Record<GoalStatus, number> = { active: 0, completed: 1, archived: 2 };

/**
 * Nearest to done first, inside each status band.
 *
 * The opposite of how budgets sort, and deliberately: a budget list leads with what is in
 * trouble, but nothing is *wrong* with a goal that has barely started - the one about to
 * land is the one worth seeing. Ties break on name so the order is stable between renders
 * rather than reshuffling every time money moves.
 */
export function sortGoals(goals: XenBudgetSavingsGoal[]): XenBudgetSavingsGoal[] {
    return [...goals].sort((a, b) => {
        const byStatus = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
        if (byStatus !== 0) return byStatus;
        const byProgress = goalProgress(b.saved, b.target_amount).percent
            - goalProgress(a.saved, a.target_amount).percent;
        if (byProgress !== 0) return byProgress;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

export interface GoalTotals {
    saved: number;
    target: number;
    activeCount: number;
    completedCount: number;
}

/**
 * The header figures, over ACTIVE goals only.
 *
 * A completed goal's target would otherwise sit in the total forever, so the strip would
 * read "$4,000 of $60,000" for someone who has finished five of six goals. Amounts are
 * only added within one currency - the same rule the summaries follow, since amounts in
 * different currencies can't be summed.
 */
export function goalTotals(goals: XenBudgetSavingsGoal[], currency: string): GoalTotals {
    let saved = 0;
    let target = 0;
    let activeCount = 0;
    let completedCount = 0;
    for (const goal of goals) {
        if (goal.status === "completed") completedCount += 1;
        if (goal.status !== "active") continue;
        activeCount += 1;
        if (goal.currency !== currency) continue;
        saved += goal.saved;
        target += goal.target_amount;
    }
    return {
        saved: Math.round(saved * 100) / 100,
        target: Math.round(target * 100) / 100,
        activeCount,
        completedCount,
    };
}
