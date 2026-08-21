import { useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
    Avatar, Box, Card, LinearProgress, MenuItem, Stack, TextField, Typography, alpha,
} from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetSummary } from "../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../hooks/xenbudget/useBudgets";
import { CategoryChip, resolveLabelColor } from "./components/LabelChip";
import BudgetProgressBar from "./components/BudgetProgressBar";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { formatCurrency, STABLE_CURRENCY_MENU_PROPS } from "../../../utils/currencyUtils";
import { cardSx, sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

// The server buckets in the viewer's zone and echoes it back, so the label is derived
// from the response rather than from the browser's clock — the two agree, and a stored
// profile preference that differs from the browser still labels correctly.
function monthLabel(from: string, timezone: string): string {
    return new Date(from).toLocaleDateString(undefined, {
        month: "long", year: "numeric", timeZone: timezone,
    });
}

export default function BookOverview() {
    const { book, currency, onCurrencyChange } = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();
    const { summary, isLoading, isError, error } = useXenBudgetSummary(book._id, { currency });
    const { budgets: budgetStatus } = useXenBudgetStatus(book._id, currency);
    const overBudgetCount = budgetStatus.filter((b) => b.over).length;

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

    if (isLoading && !summary) return <LoadingSpinner message="Adding it up..." />;
    if (isError) return <ErrorDisplay error={error} />;
    if (!summary) return null;

    const { totals } = summary;
    const biggestCategory = Math.max(...categoryRows.map((r) => r.total), 0);
    const biggestPerson = Math.max(...summary.by_person.map((p) => p.total), 0);
    const nothingYet = totals.count === 0;

    return (
        <Box sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1">{monthLabel(summary.from, summary.timezone)}</Typography>
                {summary.currencies.length > 1 && (
                    <TextField
                        select size="small" value={summary.currency}
                        onChange={(e) => onCurrencyChange(e.target.value)}
                        sx={{ width: 110 }}
                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                    >
                        {summary.currencies.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </TextField>
                )}
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <StatTile label="In" value={totals.income} currency={summary.currency} color="success.main" />
                <StatTile label="Out" value={totals.expense} currency={summary.currency} color="text.primary" />
                <StatTile
                    label="Net" value={totals.net} currency={summary.currency}
                    color={totals.net < 0 ? "error.main" : "success.main"} signed
                />
            </Stack>

            {budgetStatus.length > 0 && (
                <Card variant="outlined" sx={{ ...cardSx, p: 1.75, mb: 2 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={sectionLabelSx}>Budgets</Typography>
                        {overBudgetCount > 0 && (
                            <Typography variant="caption" color="error.main">
                                {overBudgetCount} over
                            </Typography>
                        )}
                    </Stack>
                    <Stack spacing={2}>
                        {budgetStatus.map((budget) => (
                            <BudgetProgressBar
                                key={budget._id}
                                budget={budget}
                                currency={summary.currency}
                                categoryRegistry={book.categories}
                                onClick={() => navigate(`/internal/xenbudget/books/${book._id}/settings/budgets`)}
                            />
                        ))}
                    </Stack>
                </Card>
            )}

            {nothingYet ? (
                <Box sx={emptyStateSx}>
                    <Box sx={emptyStateIconCircleSx}><InsightsIcon color="disabled" /></Box>
                    <Typography variant="subtitle1">Nothing this month yet</Typography>
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

                    {summary.by_person.length > 0 && (
                        <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1.5 }}>
                                Spending by person
                            </Typography>
                            <Stack spacing={1.25}>
                                {summary.by_person.map((person) => (
                                    <Box key={person.user_id}>
                                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                                            <Avatar src={person.avatar || undefined} sx={{ width: 22, height: 22, fontSize: 11 }}>
                                                {person.username[0]?.toUpperCase()}
                                            </Avatar>
                                            <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
                                                {person.username}
                                            </Typography>
                                            <Typography variant="body2">
                                                {formatCurrency(person.total, summary.currency)}
                                            </Typography>
                                        </Stack>
                                        <LinearProgress
                                            variant="determinate"
                                            value={biggestPerson > 0 ? (person.total / biggestPerson) * 100 : 0}
                                            sx={{ height: 5, borderRadius: 1 }}
                                        />
                                    </Box>
                                ))}
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                                Each person&rsquo;s share of every expense — these add up to the month&rsquo;s total.
                            </Typography>
                        </Card>
                    )}
                </Stack>
            )}
        </Box>
    );
}

function StatTile({ label, value, currency, color, signed }: {
    label: string; value: number; currency: string; color: string; signed?: boolean;
}) {
    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.5, flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={sectionLabelSx}>{label}</Typography>
            <Typography variant="h6" sx={{ color, mt: 0.5 }} noWrap>
                {signed && value > 0 ? "+" : ""}{formatCurrency(value, currency)}
            </Typography>
        </Card>
    );
}
