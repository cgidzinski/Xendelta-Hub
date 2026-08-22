import { useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
    Avatar, Box, Card, LinearProgress, MenuItem, Stack, TextField, Typography, alpha,
} from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetSummary } from "../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../hooks/xenbudget/useBudgets";
import { CategoryChip, resolveLabelColor } from "./components/LabelChip";
import BudgetCard from "./components/budget/BudgetCard";
import { sortBudgets, overCount } from "./components/budget/sortBudgets";
import TimePeriodFilter, { defaultMonthMode, resolvePeriod, type PeriodMode } from "./components/TimePeriodFilter";
import TotalsSummary from "./components/TotalsSummary";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { formatCurrency, STABLE_CURRENCY_MENU_PROPS } from "../../../utils/currencyUtils";
import { INCOME_COLOR } from "../../../components/ui/chartColors";
import { cardSx, sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

export default function BookOverview() {
    const { book, currency, onCurrencyChange, person, onPersonChange } = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();

    const [period, setPeriod] = useState<PeriodMode>(defaultMonthMode);
    const { from, to, groupBy, label } = useMemo(() => resolvePeriod(period), [period]);
    const now = new Date();
    const isCurrentMonth = period.kind === "month"
        && period.anchor.getFullYear() === now.getFullYear() && period.anchor.getMonth() === now.getMonth();

    const { summary, isLoading, isError, error } = useXenBudgetSummary(book._id, {
        currency, from: from.toISOString(), to: to.toISOString(), group_by: groupBy,
        people: person ? [person] : undefined,
    });
    const { status: budgetStatusResponse, budgets: budgetStatus } = useXenBudgetStatus(book._id, currency);
    // Counts every limit past its cap, the shared one and each person's, so the header
    // agrees with the red bars underneath it rather than only counting whole budgets.
    const overBudgetCount = budgetStatus.reduce((sum, b) => sum + overCount(b), 0);
    const orderedBudgets = useMemo(() => sortBudgets(budgetStatus), [budgetStatus]);
    const asOf = budgetStatusResponse?.as_of ?? new Date().toISOString();

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
    // dropped when they have no share — the breakdown stays complete. A person filter
    // narrows it to just that member.
    const personRows = useMemo(() => {
        const byId = new Map(summary?.by_person.map((p) => [p.user_id, p]) ?? []);
        return book.members
            .filter((m) => !person || m.user_id === person)
            .map((m) => ({
                user_id: m.user_id,
                username: m.username,
                avatar: m.avatar,
                total: byId.get(m.user_id)?.total ?? 0,
                income: byId.get(m.user_id)?.income ?? 0,
            }));
    }, [summary, book.members, person]);

    if (isLoading && !summary) return <LoadingSpinner message="Adding it up..." />;
    if (isError) return <ErrorDisplay error={error} />;
    if (!summary) return null;

    const { totals } = summary;
    const biggestCategory = Math.max(...categoryRows.map((r) => r.total), 0);
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
                        person={person} onPersonChange={onPersonChange}
                        members={book.members}
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

                {isCurrentMonth && orderedBudgets.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={sectionLabelSx}>Budgets</Typography>
                            {overBudgetCount > 0 && (
                                <Typography variant="caption" color="error.main">
                                    {overBudgetCount} over
                                </Typography>
                            )}
                        </Stack>
                        <Stack spacing={1}>
                            {orderedBudgets.map((budget) => (
                                <BudgetCard
                                    key={budget._id}
                                    budget={budget}
                                    currency={summary.currency}
                                    categoryRegistry={book.categories}
                                    members={book.members}
                                    asOf={asOf}
                                    onViewItems={(b) => navigate(
                                        `/internal/xenbudget/books/${book._id}/items`,
                                        { state: { budgetFilter: {
                                            categories: b.categories,
                                            from: b.period_from,
                                            to: b.period_to,
                                        } } },
                                    )}
                                    onEdit={() => navigate(`/internal/xenbudget/books/${book._id}/settings/budgets`)}
                                />
                            ))}
                        </Stack>
                    </Box>
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
                                <Stack spacing={1.25}>
                                    {categoryRows.map((row) => (
                                        <Box
                                            key={row.label}
                                            onClick={() => row.category && navigate(
                                                `/internal/xenbudget/books/${book._id}/items`,
                                            )}
                                            sx={{ cursor: row.category ? "pointer" : "default" }}
                                        >
                                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                                {row.category
                                                    ? <CategoryChip name={row.category} registry={book.categories} />
                                                    : <Typography variant="caption" color="text.secondary">Uncategorised</Typography>}
                                                <Typography variant="body2">
                                                    {formatCurrency(row.total, summary.currency)}
                                                </Typography>
                                            </Stack>
                                            <LinearProgress
                                                variant="determinate"
                                                value={biggestCategory > 0 ? (row.total / biggestCategory) * 100 : 0}
                                                sx={{
                                                    height: 5, borderRadius: 1,
                                                    bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
                                                    "& .MuiLinearProgress-bar": {
                                                        bgcolor: row.category ? resolveLabelColor(row.category, book.categories) : "text.disabled",
                                                        borderRadius: 1,
                                                    },
                                                }}
                                            />
                                        </Box>
                                    ))}
                                </Stack>
                            </Card>
                        )}
                    </Stack>
                )}
            </Box>
        </Box>
    );
}
