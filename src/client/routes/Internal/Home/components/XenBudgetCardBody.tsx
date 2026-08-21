import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useXenBudgetBooks } from "../../../../hooks/xenbudget/useBooks";
import { useXenBudgetSummary } from "../../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../../hooks/xenbudget/useBudgets";
import BudgetProgressBar from "../../XenBudget/components/BudgetProgressBar";
import { formatCurrency } from "../../../../utils/currencyUtils";
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

    // Whatever is closest to (or furthest past) its limit is what's worth surfacing.
    const tightest = [...budgets].sort((a, b) => b.percent - a.percent).slice(0, 2);
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
                <Stack spacing={1.5}>
                    {tightest.map((budget) => (
                        <BudgetProgressBar
                            key={budget._id}
                            budget={budget}
                            currency={currency}
                            categoryRegistry={book.categories}
                        />
                    ))}
                </Stack>
            )}
        </Box>
    );
}
