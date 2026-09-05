import { Stack } from "@mui/material";
import type {
    BudgetStatus, SubBudgetStatus, XenBudgetMember,
} from "../../../../../hooks/xenbudget/types";
import { formatCurrency } from "../../currency";
import { budgetPace } from "./budgetPace";
import { directionOf, periodLabel } from "./budgetKind";
import { periodNoun } from "./periodDisplay";
import BudgetBreakdown from "./BudgetBreakdown";
import BudgetHistoryStrip from "./BudgetHistoryStrip";
import PaceSummary from "./PaceSummary";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface BudgetDetailsProps {
    budget: BudgetStatus;
    /** Non-null when rendering one person's limit. */
    focus?: SubBudgetStatus | null;
    /** For the shared limit, which window: "range" (default) or "whole". */
    section?: "range" | "whole";
    currency: string;
    asOf: string;
    /** Names the window the figures cover when it isn't the budget's own period. */
    periodLabel?: string;
    members: XenBudgetMember[];
}

/**
 * What a bar can't say: which days it covers, and whether the spend is ahead of an even
 * pace. Opened in place, because losing your spot on the overview to read a number is a
 * bad trade.
 */
export default function BudgetDetails({
    budget, focus, section = "range", currency, asOf, periodLabel: labelOverride,
    members,
}: BudgetDetailsProps) {
    const money = (v: number) => formatCurrency(v, currency);

    // One person's limit: a single pace box, no who-spent or whole-period section.
    if (focus) {
        const pace = budgetPace(budget.period_from, budget.period_to, asOf, focus.spent, focus.amount);
        return (
            <Stack spacing={1.25} sx={{ pt: 1.25 }}>
                {focus.amount > 0 && (
                    <PaceSummary
                        direction={directionOf(budget.measures)}
                        period={budget.period}
                        periodLabel={labelOverride}
                        pace={pace}
                        amount={focus.amount}
                        spent={focus.spent}
                        percent={focus.percent}
                        money={money}
                    />
                )}
            </Stack>
        );
    }

    // The whole period: the budget's own window and rate, over its full period.
    if (section === "whole") {
        const periodAmount = budget.period_amount;
        const periodSpent = budget.period_spent ?? 0;
        const periodPercent = periodAmount !== undefined && periodAmount > 0
            ? Math.round((periodSpent / periodAmount) * 100) : 0;
        const pace = budgetPace(
            budget.own_period_from ?? budget.period_from,
            budget.own_period_to ?? budget.period_to,
            asOf, periodSpent, periodAmount ?? 0,
        );
        const rate = periodAmount !== undefined && periodAmount > 0
            ? `${money(periodAmount)} / ${periodNoun(budget.period)}`
            : undefined;
        const monthly = budget.monthly_amount !== undefined
            ? money(budget.monthly_amount)
            : undefined;
        const word = capitalize(periodLabel(budget.period));

        return (
            <Stack spacing={1.25} sx={{ pt: 1.25 }}>
                {periodAmount !== undefined && periodAmount > 0 && (
                    <>
                        <PaceSummary
                            direction={directionOf(budget.measures)}
                            period={budget.period}
                            windowLabel={word}
                            rate={rate}
                            monthly={monthly}
                            pace={pace}
                            amount={periodAmount}
                            spent={periodSpent}
                            percent={periodPercent}
                            money={money}
                        />
                        <BudgetBreakdown
                            budget={budget}
                            currency={currency}
                            members={members}
                            byPerson={budget.period_by_person}
                            spent={periodSpent}
                        />
                    </>
                )}
            </Stack>
        );
    }

    // The selected range (default).
    const amount = budget.amount;
    const spent = budget.spent;
    const percent = budget.percent ?? 0;
    const pace = budgetPace(budget.period_from, budget.period_to, asOf, spent, amount ?? 0);

    return (
        <Stack spacing={1.25} sx={{ pt: 1.25 }}>
            {amount !== undefined && amount > 0 && (
                <>
                    <PaceSummary
                        direction={directionOf(budget.measures)}
                        period={budget.period}
                        periodLabel={labelOverride}
                        pace={pace}
                        amount={amount}
                        spent={spent}
                        percent={percent}
                        money={money}
                    />
                    {/* Between the pace box and the breakdown on purpose: both of those
                    are about THIS window, and the strip is the one thing here that puts
                    it against the others. It draws the budget's own periods, so it is
                    unaffected by whatever range the figures above were restated for. */}
                    {budget.periods && budget.periods.length > 1 && (
                        <BudgetHistoryStrip
                            periods={budget.periods}
                            direction={directionOf(budget.measures)}
                            currency={currency}
                            asOf={asOf}
                        />
                    )}
                    <BudgetBreakdown budget={budget} currency={currency} members={members} />
                </>
            )}
        </Stack>
    );
}
