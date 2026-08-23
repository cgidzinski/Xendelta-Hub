import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useXenBudgetBooks } from "../../../../hooks/xenbudget/useBooks";
import { useXenBudgetSummary } from "../../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../../hooks/xenbudget/useBudgets";
import BudgetBar from "../../XenBudget/components/budget/BudgetBar";
import { scopeColor } from "../../XenBudget/components/budget/budgetColors";
import { troublePercent, budgetLabel } from "../../XenBudget/components/budget/sortBudgets";
import { limitColor, limitState } from "../../XenBudget/components/budget/budgetKind";
import { formatCurrency } from "../../XenBudget/currency";
import { cardSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";

/**
 * Dashboard card: this month at a glance for the most recently created book, plus its
 * two tightest budgets. Deliberately one book — the card has room for a number people
 * can act on, not a portfolio summary.
 */
export default function XenBudgetCardBody() {
    const navigate = useNavigate();
    const { books, isLoading } = useXenBudgetBooks();
    const book = books[0];
    const { summary } = useXenBudgetSummary(book?._id || "");
    const { budgets } = useXenBudgetStatus(book?._id || "");

    if (isLoading) {
        return <Skeleton variant="rectangular" height={96} sx={{ borderRadius: 2 }} />;
    }
    if (!book) {
        return <Typography variant="body2" color="text.secondary">No books yet.</Typography>;
    }

    // Whatever most needs attention is what's worth surfacing - counting a person's own
    // limit inside a budget, not just the shared one, and reading a savings goal the
    // right way up (a goal at 20% is the worrying one, not the comfortable one).
    const tightest = [...budgets].sort((a, b) => troublePercent(b) - troublePercent(a)).slice(0, 2);
    const currency = summary?.currency || book.default_currency;

    return (
        <Box
            onClick={() => navigate(`/internal/xenbudget/books/${book._id}/overview`)}
            sx={{ cursor: "pointer" }}
        >
            <Typography variant="caption" sx={sectionLabelSx}>{book.name}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, mb: tightest.length ? 1.5 : 0 }}>
                <Box sx={{ ...cardSx, p: 1, flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">Out</Typography>
                    <Typography variant="subtitle2" noWrap>
                        {formatCurrency(summary?.totals.expense ?? 0, currency)}
                    </Typography>
                </Box>
                <Box sx={{ ...cardSx, p: 1, flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">Net</Typography>
                    <Typography
                        variant="subtitle2"
                        noWrap
                        sx={{ color: (summary?.totals.net ?? 0) < 0 ? "error.main" : "success.main" }}
                    >
                        {formatCurrency(summary?.totals.net ?? 0, currency)}
                    </Typography>
                </Box>
            </Stack>

            {tightest.length > 0 && (
                /* The dashboard has room for a number, not a whole budget card: one line
                per budget, showing whichever of its limits is tightest. */
                <Stack spacing={1.25}>
                    {tightest.map((budget) => {
                        // The row that most needs attention: furthest along a cap, or
                        // furthest BEHIND a goal.
                        const worst = (p: number) => (budget.kind === "goal" ? -p : p);
                        const tightestSub = [...budget.sub_budgets]
                            .sort((a, b) => worst(b.percent) - worst(a.percent))[0];
                        // A budget with no overall amount is read off that person.
                        const useSub = budget.amount === undefined
                            || (tightestSub && worst(tightestSub.percent) > worst(budget.percent ?? 0));
                        const percent = useSub ? tightestSub.percent : (budget.percent ?? 0);
                        const over = useSub ? tightestSub.over : (budget.over ?? false);
                        const stateColor = limitColor(limitState(budget.kind, percent));
                        const spent = useSub ? tightestSub.spent : budget.spent;
                        const amountFor = useSub ? tightestSub.amount : (budget.amount ?? 0);
                        const name = budgetLabel(budget);
                        return (
                            <Box key={budget._id}>
                                <Stack
                                    direction="row" alignItems="center" spacing={1}
                                    sx={{ mb: 0.5, minWidth: 0 }}
                                >
                                    <Typography variant="caption" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                                        {name}{useSub ? ` · ${tightestSub.person_name}` : ""}
                                    </Typography>
                                    <Typography
                                        variant="caption" noWrap
                                        sx={{ flexShrink: 0, color: stateColor ?? "text.secondary" }}
                                    >
                                        {formatCurrency(spent, currency)} / {formatCurrency(amountFor, currency)}
                                    </Typography>
                                </Stack>
                                <BudgetBar
                                    spent={spent} amount={amountFor} percent={percent} over={over}
                                    kind={budget.kind}
                                    color={scopeColor(budget.categories, book.categories)}
                                    height={6}
                                    label={`${name}: ${formatCurrency(spent, currency)} of ${formatCurrency(amountFor, currency)}, ${percent}% of the ${budget.kind === "goal" ? "goal" : "limit"}`}
                                />
                            </Box>
                        );
                    })}
                </Stack>
            )}
        </Box>
    );
}
