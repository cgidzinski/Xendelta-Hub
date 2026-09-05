import { Avatar, AvatarGroup, Box, Chip, Divider, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useXenBudgetBooks } from "../../../../hooks/xenbudget/useBooks";
import { useXenBudgetBook } from "../../../../hooks/xenbudget/useBook";
import { useXenBudgetSummary } from "../../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../../hooks/xenbudget/useBudgets";
import { budgetPace } from "../../XenBudget/components/budget/budgetPace";
import TotalsSummary from "../../XenBudget/components/TotalsSummary";
import { formatCurrency } from "../../XenBudget/currency";
import { cardSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import type { XenBudgetBook, BudgetStatus } from "../../../../hooks/xenbudget/types";

/**
 * Dashboard card: this month at a glance for the most recently *active* book, plus one
 * combined pace figure across its budgets. Deliberately one book, one number — the card
 * has room for something people can act on, not a portfolio summary.
 */
function mostRecentlyActive(books: XenBudgetBook[]): XenBudgetBook | undefined {
    return [...books].sort((a, b) => {
        const aAt = new Date(a.last_item_at ?? a.created_at).getTime();
        const bAt = new Date(b.last_item_at ?? b.created_at).getTime();
        return bAt - aAt;
    })[0];
}

/**
 * How far this one budget is from where an even spend would have it, in currency - or
 * null when it doesn't contribute to a combined pace figure: goals read "ahead/behind"
 * backwards from caps, and a closed window has nothing left to project.
 *
 * Mirrors the tightest-limit logic that used to drive the per-budget list: a cap with
 * per-person sub-budgets is read off whichever of the overall cap or its worst sub-budget
 * is tightest, never both, so the same dollars aren't counted twice within one budget.
 */
function budgetAhead(budget: BudgetStatus): { ahead: number; amount: number } | null {
    if (budget.measures === "income") return null;
    const tightestSub = [...budget.sub_budgets].sort((a, b) => b.percent - a.percent)[0];
    const useSub = budget.amount === undefined
        || (tightestSub && tightestSub.percent > (budget.percent ?? 0));
    const spent = useSub ? tightestSub.spent : budget.spent;
    const amount = useSub ? tightestSub.amount : (budget.amount ?? 0);
    if (amount <= 0) return null;
    const pace = budgetPace(budget.period_from, budget.period_to, new Date().toISOString(), spent, amount);
    if (pace.finished) return null;
    return { ahead: pace.ahead, amount };
}

export default function XenBudgetCardBody() {
    const navigate = useNavigate();
    const { books, isLoading } = useXenBudgetBooks();
    const book = mostRecentlyActive(books);
    const { book: bookDetail } = useXenBudgetBook(book?._id || "");
    const { summary } = useXenBudgetSummary(book?._id || "");
    const { budgets } = useXenBudgetStatus(book?._id || "");

    if (isLoading) {
        return <Skeleton variant="rectangular" height={96} sx={{ borderRadius: 2 }} />;
    }
    if (!book) {
        return <Typography variant="body2" color="text.secondary">No books yet.</Typography>;
    }

    const currency = summary?.currency || book.default_currency;
    const otherBookCount = books.length - 1;
    const needsReviewCount = bookDetail?.needs_review_count ?? 0;
    const missingCategoryCount = bookDetail?.review_count ?? 0;

    const paceEntries = budgets.map(budgetAhead).filter((e): e is { ahead: number; amount: number } => e !== null);
    const combinedAhead = paceEntries.reduce((sum, e) => sum + e.ahead, 0);
    const combinedAmount = paceEntries.reduce((sum, e) => sum + e.amount, 0);
    const paceThreshold = Math.max(combinedAmount * 0.02, 1);
    const hasPace = paceEntries.length > 0;

    // The card itself already navigates to the books list (AppCard's own CardActionArea,
    // via app.path) - this box is the one part of it that should jump straight to the
    // book being previewed, so its click has to stop there rather than bubble up.
    const goToBook = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate(`/internal/xenbudget/books/${book._id}/overview`);
    };

    return (
        <Box
            onClick={goToBook}
            sx={{ ...cardSx, p: 1, cursor: "pointer" }}
        >
            <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" sx={{ ...sectionLabelSx, flexGrow: 1, minWidth: 0 }} noWrap>
                    {book.name}
                    {otherBookCount > 0 && (
                        <Typography component="span" variant="caption" color="text.secondary">
                            {" "}· +{otherBookCount} more
                        </Typography>
                    )}
                </Typography>
                {(needsReviewCount > 0 || missingCategoryCount > 0) && (
                    <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                        {needsReviewCount > 0 && (
                            <Chip
                                size="small"
                                color="error"
                                variant="outlined"
                                label={`${needsReviewCount} Flagged`}
                                sx={{ height: 20, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }}
                            />
                        )}
                        {missingCategoryCount > 0 && (
                            <Chip
                                size="small"
                                color="warning"
                                variant="outlined"
                                label={`${missingCategoryCount} Needs Category`}
                                sx={{ height: 20, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }}
                            />
                        )}
                    </Stack>
                )}
            </Stack>

            <Divider sx={{ my: 1 }} />

            <TotalsSummary
                bare
                income={summary?.totals.income ?? 0}
                expense={summary?.totals.expense ?? 0}
                net={summary?.totals.net ?? 0}
                currency={currency}
            />

            {summary && summary.by_person.length > 1 && (
                <AvatarGroup
                    max={4}
                    sx={{ justifyContent: "flex-end", mt: 1, "& .MuiAvatar-root": { width: 24, height: 24, fontSize: 11 } }}
                >
                    {summary.by_person.map((person) => (
                        <Tooltip
                            key={person.user_id}
                            title={`${person.username}: ${formatCurrency(person.total, currency)}`}
                        >
                            <Avatar src={person.avatar || undefined} alt={person.username}>
                                {person.username.charAt(0).toUpperCase()}
                            </Avatar>
                        </Tooltip>
                    ))}
                </AvatarGroup>
            )}

            {hasPace && (
                <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                        Pace · {paceEntries.length} budget{paceEntries.length === 1 ? "" : "s"}
                    </Typography>
                    <Typography
                        variant="subtitle2"
                        noWrap
                        sx={{
                            color: combinedAhead > paceThreshold
                                ? "error.main"
                                : combinedAhead < -paceThreshold ? "success.main" : "text.primary",
                        }}
                    >
                        {Math.abs(combinedAhead) < paceThreshold
                            ? "On pace"
                            : combinedAhead > 0
                                ? `${formatCurrency(combinedAhead, currency)} ahead of pace`
                                : `${formatCurrency(-combinedAhead, currency)} behind pace`}
                    </Typography>
                </>
            )}
        </Box>
    );
}
