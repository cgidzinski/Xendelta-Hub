import { useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
    Avatar, Box, Card, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetSummary } from "../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../hooks/xenbudget/useBudgets";
import { CategoryChip } from "./components/LabelChip";
import BudgetCard from "./components/budget/BudgetCard";
import { sortBudgets, overCount, metCount } from "./components/budget/sortBudgets";
import TimePeriodFilter, {
    defaultMonthMode, parsePeriodMode, resolvePeriod, serializePeriodMode, type PeriodMode,
} from "./components/TimePeriodFilter";
import TotalsSummary from "./components/TotalsSummary";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { formatCurrency } from "./currency";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../utils/currencyUtils";
import { INCOME_COLOR } from "../../../components/ui/chartColors";
import { cardSx, sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

export default function BookOverview() {
    const { book, currency, onCurrencyChange } = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();

    // Remembered per book, so leaving and coming back to the Overview picks up where you
    // left off instead of resetting to "this month" every time.
    const periodLsKey = `xenbudget_period_overview_${book._id}`;
    const [period, setPeriodState] = useState<PeriodMode>(
        () => parsePeriodMode(localStorage.getItem(periodLsKey)) ?? defaultMonthMode(),
    );
    const setPeriod = (next: PeriodMode) => {
        setPeriodState(next);
        localStorage.setItem(periodLsKey, serializePeriodMode(next));
    };
    const { from, to, groupBy, label } = useMemo(() => resolvePeriod(period), [period]);

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
    // Counts every limit past its cap, the shared one and each person's, so the header
    // agrees with the red bars actually on screen rather than with the unfiltered book.
    // Savings goals are counted separately and the other way up: passing one is the point.
    const overBudgetCount = visibleBudgets.reduce((sum, b) => sum + overCount(b), 0);
    const goalsMetCount = visibleBudgets.reduce((sum, b) => sum + metCount(b), 0);
    const asOf = budgetStatusResponse?.as_of ?? new Date().toISOString();
    // The figures were measured in whatever currency /budget-status used, which is not
    // necessarily the one the summary settled on - label them with the one they're in.
    const budgetCurrency = budgetStatusResponse?.currency ?? currency;

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
            <Box sx={{ p: 2, pb: 1.5, flexShrink: 0 }}>
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
                    <TimePeriodFilter
                        mode={period} onModeChange={setPeriod}
                        showExtraPresets
                    />
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, pb: 2 }}>
                <TotalsSummary
                    income={totals.income} expense={totals.expense} net={totals.net}
                    currency={summary.currency} sx={{ mb: 2 }}
                />

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
                        {/* auto-fit (not auto-fill): empty tracks collapse, so a short
                        last row stretches to fill the width instead of leaving a gap.
                        320px keeps this at 1-4 columns inside the page's 1600px cap,
                        rather than fanning out further on a wide monitor - wrapped in
                        min(...,100%) so that floor can never exceed a narrow phone's
                        actual width. */}
                        <Box sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
                            gap: 1,
                            alignItems: "start",
                        }}>
                            {visibleBudgets.map((budget) => (
                                <BudgetCard
                                    key={budget._id}
                                    budget={budget}
                                    currency={budgetCurrency}
                                    categoryRegistry={book.categories}
                                    members={book.members}
                                    asOf={asOf}
                                    variant="minimal"
                                    periodLabel={label}
                                    onViewItems={(b) => navigate(
                                        `/internal/xenbudget/books/${book._id}/items`,
                                        {
                                            state: {
                                                budgetFilter: {
                                                    categories: b.categories,
                                                    from: b.period_from,
                                                    to: b.period_to,
                                                }
                                            }
                                        },
                                    )}
                                    onEdit={() => navigate(`/internal/xenbudget/books/${book._id}/settings/budgets`)}
                                />
                            ))}
                        </Box>
                    </Card>
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
        </Box>
    );
}
