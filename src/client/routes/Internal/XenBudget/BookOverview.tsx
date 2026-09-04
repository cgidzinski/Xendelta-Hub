import { useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
    Avatar, Box, Button, Card, Link, MenuItem, Stack, TextField, Typography, useMediaQuery,
} from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import SavingsIcon from "@mui/icons-material/Savings";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetSummary } from "../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../hooks/xenbudget/useBudgets";
import { useXenBudgetRecurring } from "../../../hooks/xenbudget/useRecurring";
import { CategoryChip } from "./components/LabelChip";
import BudgetCard from "./components/budget/BudgetCard";
import BudgetBar from "./components/budget/BudgetBar";
import { limitCaption } from "./components/budget/budgetKind";
import { goalProgress, sortGoals } from "./components/goals/goalProgress";
import RecurringCard from "./components/recurring/RecurringCard";
import { useRuleEditor } from "./components/rules/useRuleEditor";
import ProjectionCard from "./components/budget/ProjectionCard";
import { projectBook } from "./components/budget/bookPace";
import { commitmentTotal } from "./components/recurring/recurringDisplay";
import { useBalancedColumns } from "./components/budget/useBalancedColumns";
import { sortBudgets, overCount, metCount } from "./components/budget/sortBudgets";
import TimePeriodFilter, { summaryQuickPicks } from "./components/TimePeriodFilter";
import { resolvePeriod } from "./components/periodMode";
import TotalsSummary from "./components/TotalsSummary";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { formatCurrency } from "./currency";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../utils/currencyUtils";
import { INCOME_COLOR } from "../../../components/ui/chartColors";
import { cardSx, sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

export default function BookOverview() {
    const {
        book, currency, onCurrencyChange, period, onPeriodChange,
    } = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();

    // The window is the book's, not this tab's — see BookDetail.
    const { from, to, groupBy, label, bounded } = useMemo(() => resolvePeriod(period), [period]);

    const { summary, isLoading, isError, error } = useXenBudgetSummary(book._id, {
        currency, from: from.toISOString(), to: to.toISOString(), group_by: groupBy,
    });
    // Measured over the selected period, not each budget's own - picking "Year" showing
    // this month's live bars would be answering a question nobody asked.
    const budgetRange = useMemo(
        () => ({ from: from.toISOString(), to: to.toISOString() }),
        [from, to],
    );
    const { status: budgetStatusResponse, budgets: budgetStatus } = useXenBudgetStatus(
        book._id, currency, budgetRange,
    );
    const visibleBudgets = useMemo(
        () => sortBudgets(budgetStatus),
        [budgetStatus],
    );
    // Nearest to done first, so the strip leads with the goal about to land.
    const activeGoals = useMemo(
        () => sortGoals((book.savings_goals ?? []).filter((g) => g.status === "active")),
        [book.savings_goals],
    );
    // Deliberately NOT scoped to the selected period: a subscription is a standing
    // commitment, so "what do I pay every month" is the same answer whether you're looking
    // at August or at the year. Detection needs a long run of history to see a cadence at
    // all, which a one-month window would never contain.
    const { recurring } = useXenBudgetRecurring(book._id, { currency });
    // One rule dialog for the page, shared with the recurring rows' rule control.
    const ruleEditor = useRuleEditor(book);
    // Balanced columns: each card goes into the shortest column, and the result is locked
    // so expanding a card only grows its own column - cards never reshuffle.
    const isSm = useMediaQuery("(min-width:600px)");
    const isMd = useMediaQuery("(min-width:900px)");
    const isXl = useMediaQuery("(min-width:1536px)");
    const columnCount = isXl ? 4 : isMd ? 3 : isSm ? 2 : 1;
    const { columns: budgetColumns, measureRef } = useBalancedColumns(visibleBudgets, columnCount);
    // Counts every limit past its cap, the shared one and each person's, so the header
    // agrees with the red bars actually on screen rather than with the unfiltered book.
    // Savings goals are counted separately and the other way up: passing one is the point.
    const overBudgetCount = visibleBudgets.reduce((sum, b) => sum + overCount(b), 0);
    const goalsMetCount = visibleBudgets.reduce((sum, b) => sum + metCount(b), 0);
    const asOf = budgetStatusResponse?.as_of ?? new Date().toISOString();
    // The figures were measured in whatever currency /budget-status used, which is not
    // necessarily the one the summary settled on - label them with the one they're in.
    const budgetCurrency = budgetStatusResponse?.currency ?? currency;

    // Where the book lands by the end of the selected window. The commitments feeding it
    // are only the charges still TO COME — one already posted is inside the spend figure,
    // and adding it again would inflate the projection by a month of subscriptions.
    const projection = useMemo(() => {
        if (!summary) return null;
        // "All time" runs from the epoch to today, so there is no end to project towards —
        // the figure would read "100% through All time" and restate the actuals. A
        // projection only means something inside a window that actually closes.
        if (!bounded) return null;
        return projectBook({
            periodFrom: from.toISOString(),
            periodTo: to.toISOString(),
            asOf: new Date().toISOString(),
            expense: summary.totals.expense,
            income: summary.totals.income,
            committed: commitmentTotal(recurring?.series ?? [], new Date(), to),
        });
    }, [summary, recurring, from, to, bounded]);

    const categoryRows = useMemo(() => {
        if (!summary) return [];
        const rows = summary.by_category.map((c) => ({
            label: c.category, total: c.total, category: c.category,
        }));
        if (summary.uncategorised.count > 0) {
            rows.push({ label: "Uncategorised", total: summary.uncategorised.total, category: "" });
        }
        return rows;
    }, [summary]);

    // Every member appears in the per-person card, defaulting to zero rather than being
    // dropped when they have no share — the breakdown stays complete.
    const personRows = useMemo(() => {
        const byId = new Map(summary?.by_person.map((p) => [p.user_id, p]) ?? []);
        return book.members
            .map((m) => ({
                user_id: m.user_id,
                username: m.username,
                avatar: m.avatar,
                total: byId.get(m.user_id)?.total ?? 0,
                income: byId.get(m.user_id)?.income ?? 0,
            }));
    }, [summary, book.members]);

    if (isLoading && !summary) return <LoadingSpinner message="Adding it up..." />;
    if (isError) return <ErrorDisplay error={error} />;
    if (!summary) return null;

    const { totals } = summary;
    const biggestPersonTotal = Math.max(...personRows.map((p) => p.total + p.income), 0);
    const nothingYet = totals.count === 0;

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ pl: 2, pr: { xs: 2, sm: 3.5 }, pt: 2, pb: 1.5, flexShrink: 0 }}>
                <Stack spacing={1}>
                    {summary.currencies.length > 1 && (
                        <TextField
                            select size="small" value={summary.currency}
                            onChange={(e) => onCurrencyChange(e.target.value)}
                            sx={{ width: 110, alignSelf: "flex-end" }}
                            slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                        >
                            {summary.currencies.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </TextField>
                    )}
                    {/* Goals on the left, the period on the right. Goals is somewhere you
                    GO — it is not scoped to the window this page is showing — so it sits
                    apart from the control that changes that window rather than beside it. */}
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Button
                            size="small" variant="outlined" startIcon={<SavingsIcon />}
                            onClick={() => navigate(`/internal/xenbudget/books/${book._id}/goals`)}
                        >
                            Savings goals
                        </Button>
                        <Box sx={{ flexGrow: 1 }} />
                        <TimePeriodFilter
                            mode={period} onModeChange={onPeriodChange}
                            quickPicks={summaryQuickPicks()}
                        />
                    </Stack>
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pl: 2, pr: { xs: 2, sm: 3.5 }, pb: 2 }}>
                <TotalsSummary
                    income={totals.income} expense={totals.expense} net={totals.net}
                    currency={summary.currency} sx={{ mb: 2 }}
                />

                {!nothingYet && projection && (
                    <ProjectionCard
                        projection={projection}
                        currency={summary.currency}
                        periodLabel={label}
                    />
                )}

                <Card variant="outlined" sx={{ ...cardSx, p: 1.75, mb: 2 }}>
                    <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1.5 }}>
                        Breakdown
                    </Typography>
                    <Stack spacing={1.5}>
                        {[...personRows]
                            .sort((a, b) => (b.total + b.income) - (a.total + a.income))
                            .map((person) => (
                                <Box key={person.user_id}>
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                                        <Avatar src={person.avatar || undefined} sx={{ width: 22, height: 22, fontSize: 11 }}>
                                            {person.username[0]?.toUpperCase()}
                                        </Avatar>
                                        <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
                                            {person.username}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: INCOME_COLOR, fontWeight: 600 }}>
                                            +{formatCurrency(person.income, summary.currency)}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: "error.main", fontWeight: 600 }}>
                                            −{formatCurrency(person.total, summary.currency)}
                                        </Typography>
                                    </Stack>
                                    <Box sx={{
                                        display: "flex", height: 5, borderRadius: 1, overflow: "hidden",
                                        bgcolor: (theme) => theme.palette.action.hover,
                                    }}>
                                        <Box sx={{
                                            flexShrink: 0,
                                            width: `${biggestPersonTotal > 0 ? (person.income / biggestPersonTotal) * 100 : 0}%`,
                                            bgcolor: INCOME_COLOR,
                                        }} />
                                        <Box sx={{
                                            flexShrink: 0,
                                            width: `${biggestPersonTotal > 0 ? (person.total / biggestPersonTotal) * 100 : 0}%`,
                                            bgcolor: "error.main",
                                        }} />
                                    </Box>
                                </Box>
                            ))}
                    </Stack>
                </Card>

                {visibleBudgets.length > 0 && (
                    <Card variant="outlined" sx={{ ...cardSx, p: 1.75, mb: 2 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" sx={sectionLabelSx}>Budgets</Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                                {goalsMetCount > 0 && (
                                    <Typography variant="caption" sx={{ color: INCOME_COLOR }}>
                                        {goalsMetCount} saved
                                    </Typography>
                                )}
                                {overBudgetCount > 0 && (
                                    <Typography variant="caption" color="error.main">
                                        {overBudgetCount} over
                                    </Typography>
                                )}
                            </Stack>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                            Scaled to {label} — a monthly cap counts once per month covered.
                        </Typography>
                        {/* Fixed-column masonry: expanding a card only pushes the cards below
                        it in its own column down - cards never jump to another column. */}
                        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                            {budgetColumns.map((col, i) => (
                                <Stack key={i} spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                                    {col.map((budget) => (
                                        <Box key={budget._id} ref={measureRef(budget._id)}>
                                            <BudgetCard
                                                budget={budget}
                                                currency={budgetCurrency}
                                                categoryRegistry={book.categories}
                                                members={book.members}
                                                asOf={asOf}
                                                periodLabel={label}
                                                onViewItems={(b) => navigate(
                                                    `/internal/xenbudget/books/${book._id}/items`,
                                                    {
                                                        state: {
                                                            budgetFilter: {
                                                                categories: b.categories,
                                                                from: b.period_from,
                                                                to: b.period_to,
                                                                period: b.period,
                                                            }
                                                        }
                                                    },
                                                )}
                                            />
                                        </Box>
                                    ))}
                                </Stack>
                            ))}
                        </Box>
                    </Card>
                )}

                {activeGoals.length > 0 && (
                    <Card variant="outlined" sx={{ ...cardSx, p: 1.75, mb: 2 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={sectionLabelSx}>Savings goals</Typography>
                            <Link
                                component="button" variant="caption" underline="hover"
                                onClick={() => navigate(`/internal/xenbudget/books/${book._id}/goals`)}
                            >
                                View all
                            </Link>
                        </Stack>
                        {/* Not scoped to the selected period, and deliberately: a goal
                        accumulates across every window, so "how close am I to the car?" has
                        the same answer whether August or the year is on screen. */}
                        <Stack spacing={1.25}>
                            {activeGoals.slice(0, 3).map((goal) => {
                                const { percent, remaining } = goalProgress(goal.saved, goal.target_amount);
                                return (
                                    <Box key={goal._id}>
                                        <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
                                            <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>{goal.name}</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                                {limitCaption("goal", remaining, percent, (v) => formatCurrency(v, goal.currency))}
                                            </Typography>
                                        </Stack>
                                        <BudgetBar
                                            spent={Math.max(0, goal.saved)}
                                            amount={goal.target_amount}
                                            percent={percent}
                                            over={goal.saved > goal.target_amount}
                                            kind="goal"
                                            color={INCOME_COLOR}
                                            height={6}
                                            label={`${goal.name}: ${formatCurrency(goal.saved, goal.currency)} of ${formatCurrency(goal.target_amount, goal.currency)} saved`}
                                        />
                                    </Box>
                                );
                            })}
                            {activeGoals.length > 3 && (
                                <Typography variant="caption" color="text.secondary">
                                    {activeGoals.length - 3} more on the Goals tab.
                                </Typography>
                            )}
                        </Stack>
                    </Card>
                )}

                {recurring && recurring.series.length > 0 && (
                    <RecurringCard
                        series={recurring.series}
                        monthlyCommitted={recurring.monthly_committed}
                        currency={recurring.currency}
                        categoryRegistry={book.categories}
                        onViewItems={(s) => navigate(
                            `/internal/xenbudget/books/${book._id}/items`,
                            { state: { merchantSeed: { merchant: s.merchant } } },
                        )}
                        onMakeRule={(s) => ruleEditor.openForMerchant(s.merchant, s.categories)}
                        onOpenRule={ruleEditor.openExistingRule}
                        rules={book.rules}
                    />
                )}

                {nothingYet ? (
                    <Box sx={emptyStateSx}>
                        <Box sx={emptyStateIconCircleSx}><InsightsIcon color="disabled" /></Box>
                        <Typography variant="subtitle1">Nothing in {label} yet</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add an item and the tally updates for everyone in the book.
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        {categoryRows.length > 0 && (
                            <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1.5 }}>
                                    Spending by category
                                </Typography>
                                {/* auto-fit, floor wrapped in min(...,100%) so it can never
                                exceed the container - a bare 320px (or even 200px, now that
                                a row is just a chip and two figures) can still overflow a
                                narrow phone otherwise. */}
                                <Box sx={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
                                    gap: 1.25,
                                    alignItems: "start",
                                }}>
                                    {categoryRows.map((row) => {
                                        const percent = totals.expense > 0
                                            ? Math.round((row.total / totals.expense) * 100)
                                            : 0;
                                        return (
                                            <Stack
                                                key={row.label}
                                                direction="row" alignItems="center" justifyContent="space-between" spacing={1}
                                                sx={{ minWidth: 0 }}
                                            >
                                                {row.category
                                                    ? <CategoryChip name={row.category} registry={book.categories} />
                                                    : <Typography variant="caption" color="text.secondary">Uncategorised</Typography>}
                                                <Typography variant="body2" noWrap sx={{ flexShrink: 0 }}>
                                                    {formatCurrency(row.total, summary.currency)}
                                                    <Typography component="span" variant="body2" color="text.secondary">
                                                        {" · "}{percent}%
                                                    </Typography>
                                                </Typography>
                                            </Stack>
                                        );
                                    })}
                                </Box>
                            </Card>
                        )}
                    </Stack>
                )}
            </Box>

            {ruleEditor.dialog}
        </Box>
    );
}
