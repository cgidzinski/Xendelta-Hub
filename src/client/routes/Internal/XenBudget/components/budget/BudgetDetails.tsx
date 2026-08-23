import { Stack } from "@mui/material";
import type {
    BudgetStatus, SubBudgetStatus,
} from "../../../../../hooks/xenbudget/types";
import { formatCurrency } from "../../currency";
import { budgetPace } from "./budgetPace";
import PaceSummary from "./PaceSummary";

interface BudgetDetailsProps {
    budget: BudgetStatus;
    /** Which limit was opened: the shared one, or one person's. */
    focus: SubBudgetStatus | null;
    currency: string;
    asOf: string;
    /** Names the window the figures cover when it isn't the budget's own period. */
    periodLabel?: string;
}

/**
 * What a bar can't say: which days it covers, and whether the spend is ahead of an even
 * pace. Opened in place, because losing your spot on the overview to read a number is a
 * bad trade.
 */
export default function BudgetDetails({
    budget, focus, currency, asOf, periodLabel,
}: BudgetDetailsProps) {
    const money = (v: number) => formatCurrency(v, currency);
    const amount = focus ? focus.amount : budget.amount;
    const spent = focus ? focus.spent : budget.spent;
    const percent = focus ? focus.percent : (budget.percent ?? 0);
    const pace = budgetPace(budget.period_from, budget.period_to, asOf, spent, amount ?? 0);

    return (
        <Stack spacing={1.25} sx={{ pt: 1.25 }}>
            {amount !== undefined && amount > 0 && (
                <PaceSummary
                    kind={budget.kind}
                    period={budget.period}
                    periodLabel={periodLabel}
                    pace={pace}
                    amount={amount}
                    spent={spent}
                    percent={percent}
                    money={money}
                />
            )}
        </Stack>
    );
}
