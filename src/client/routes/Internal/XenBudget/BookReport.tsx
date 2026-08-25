import { useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
    Box, Button, Card, MenuItem, Stack, TextField, Typography, useMediaQuery,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import InsightsIcon from "@mui/icons-material/Insights";
import {
    Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
    Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetSummary } from "../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../hooks/xenbudget/useBudgets";
import TimePeriodFilter, {
    defaultYearMode, parsePeriodMode, resolvePeriod, serializePeriodMode, type PeriodMode,
} from "./components/TimePeriodFilter";
import TotalsSummary from "./components/TotalsSummary";
import BudgetCard from "./components/budget/BudgetCard";
import { useBalancedColumns } from "./components/budget/useBalancedColumns";
import { sortBudgets } from "./components/budget/sortBudgets";
import CategoryReportTable from "./components/report/CategoryReportTable";
import {
    allowanceByPeriod, buildCategoryReport,
    type CategoryReportRow, type PeriodTotals,
} from "./components/report/categoryReportRows";
import { periodColumnLabels } from "./components/report/periodColumns";
import { resolveLabelColor } from "./components/LabelChip";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { formatCurrency } from "./currency";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../utils/currencyUtils";
import { toCsv, downloadCsv } from "../../../utils/csvMapping";
import {
    EXPENSE_RED, INCOME_COLOR, MAGNITUDE_COLOR,
} from "../../../components/ui/chartColors";
import { cardSx, sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

// Past this many categories a bar chart stops being readable, so the tail is folded into
// a single "Other" bar rather than adding more rows nobody can compare.
const MAX_BARS = 8;

const AXIS = { stroke: "#8b8b85", fontSize: 12 } as const;
const GRID = "#ffffff14";
// Axis ticks are for scanning, so they're abbreviated — a full "$8,000.00" needs a
// gutter wide enough to squeeze the plot, and gets truncated if it doesn't get one.
// Exact figures live on the direct labels, the tooltip and the table view.
const AXIS_WIDTH = 60;
// Wide enough for the longest formatted value sitting to the right of the longest bar;
// at 72 the top bar's label was clipped by the container edge.
const VALUE_LABEL_GUTTER = 104;
const CATEGORY_WIDTH = 132;
// The stacked composition chart carries one hue per series, and the palette is validated
// for eight. Seven named categories plus "Other" is exactly that.
const MAX_STACK_SERIES = 8;
// The neutral half of the budget-vs-actual pairing: the cap is the backdrop the spend is
// read against, so it stays quiet and lets the spend bar carry the colour.
const BUDGETED_COLOR = "#6b6b64";
// Needs vs wants: two validated palette hues, deliberately not the income/expense pairing —
// a need isn't a credit and a want isn't a debit.
const NEED_COLOR = "#3987e5";
const WANT_COLOR = "#c98500";

export default function BookReport() {
    const { book, currency, onCurrencyChange } = useOutletContext<BookDetailContext>();
    const navigate = useNavigate();
    // Remembered per book, so leaving and coming back to the Report picks up where you
    // left off instead of resetting to "this year" every time.
    const periodLsKey = `xenbudget_period_report_${book._id}`;
    const [period, setPeriodState] = useState<PeriodMode>(
        () => parsePeriodMode(localStorage.getItem(periodLsKey)) ?? defaultYearMode(),
    );
    const setPeriod = (next: PeriodMode) => {
        setPeriodState(next);
        localStorage.setItem(periodLsKey, serializePeriodMode(next));
    };

    const range = useMemo(() => resolvePeriod(period), [period]);

    const { summary, isLoading, isError, error } = useXenBudgetSummary(book._id, {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        group_by: range.groupBy,
        currency,
    });
    // Measured over the report range, not each budget's own period — a 2025 report showing
    // this month's bars would be answering a question nobody asked.
    const budgetRange = useMemo(
        () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
        [range.from, range.to],
    );
    const { status: budgetStatusResponse, budgets } = useXenBudgetStatus(
        book._id, currency, budgetRange,
    );
    const visibleBudgets = useMemo(
        () => sortBudgets(budgets),
        [budgets],
    );
    // Balanced columns: each card goes into the shortest column, and the result is locked
    // so expanding a card only grows its own column - cards never reshuffle.
    const isSm = useMediaQuery("(min-width:600px)");
    const isMd = useMediaQuery("(min-width:900px)");
    const isXl = useMediaQuery("(min-width:1536px)");
    const columnCount = isXl ? 4 : isMd ? 3 : isSm ? 2 : 1;
    const { columns: budgetColumns, measureRef } = useBalancedColumns(visibleBudgets, columnCount);

    // Budget against actual for the range on screen. The caps are restated for that range
    // rather than shown as one period's worth - see budgetedForRange.
    const categoryReport = useMemo(() => buildCategoryReport({
        allCategories: book.categories.map((c) => c.name),
        byCategory: summary?.by_category ?? [],
        byCategoryPeriod: summary?.by_category_period ?? [],
        uncategorised: summary?.uncategorised ?? { total: 0, count: 0 },
        uncategorisedByPeriod: summary?.uncategorised_by_period ?? [],
        // The same buckets the charts use, so a column lines up with a bar.
        byPeriod: summary?.by_period ?? [],
        budgets,
        rangeFrom: range.from,
        rangeTo: range.to,
    }), [summary, budgets, book.categories, range.from, range.to]);

    const periodData = useMemo(() => (summary?.by_period ?? []).map((p) => ({
        key: p.key,
        Out: p.expense,
        In: p.income,
        Net: p.net,
    })), [summary]);

    const foldTail = <T extends { total: number }>(rows: T[], label: (r: T) => string) => {
        const sorted = [...rows].sort((a, b) => b.total - a.total);
        if (sorted.length <= MAX_BARS) return sorted.map((r) => ({ name: label(r), total: r.total }));
        const head = sorted.slice(0, MAX_BARS - 1).map((r) => ({ name: label(r), total: r.total }));
        const rest = sorted.slice(MAX_BARS - 1).reduce((sum, r) => sum + r.total, 0);
        return [...head, { name: `Other (${sorted.length - MAX_BARS + 1})`, total: Math.round(rest * 100) / 100 }];
    };

    // Colored to match each category's chip everywhere else in the book, rather than a
    // flat hue - the folded tail and "Uncategorised" carry no real category, so they get
    // the same neutral the budget-vs-actual chart uses for its own quiet backdrop colour.
    const categoryData = useMemo(() => {
        if (!summary) return [];
        const rows = summary.by_category.map((c) => ({ total: c.total, category: c.category }));
        if (summary.uncategorised.count > 0) {
            rows.push({ total: summary.uncategorised.total, category: "Uncategorised" });
        }
        return foldTail(rows, (r) => r.category).map((r) => ({
            ...r,
            color: r.name === "Uncategorised" || r.name.startsWith("Other (")
                ? BUDGETED_COLOR
                : resolveLabelColor(r.name, book.categories),
        }));
    }, [summary, book.categories]);

    // Needs vs wants: every category folds into its classification, with unclassified
    // categories and uncategorised money gathered into "Other". Only rendered when at
    // least one category is actually classified need or want.
    const needWantData = useMemo(() => {
        if (!summary) return [];
        const kindByName: Record<string, "need" | "want" | "none"> = {};
        for (const c of book.categories) kindByName[c.name.toLowerCase()] = c.need_want ?? "none";
        const buckets = { need: 0, want: 0, none: 0 };
        for (const c of summary.by_category) {
            const kind = kindByName[c.category.toLowerCase()] ?? "none";
            buckets[kind] += c.total;
        }
        buckets.none += summary.uncategorised.total;
        if (buckets.need <= 0 && buckets.want <= 0) return [];
        // Kept whole (zeroes included) so the legend always names Needs and Wants even
        // when one of them has no spending in the range; the pie skips zero slices itself.
        return [
            { name: "Needs", total: buckets.need, color: NEED_COLOR },
            { name: "Wants", total: buckets.want, color: WANT_COLOR },
            { name: "Other", total: buckets.none, color: BUDGETED_COLOR },
        ];
    }, [summary, book.categories]);

    // One row per person, spend and income both kept (not folded into "Other" - book
    // membership is small, and the overlap chart below needs both figures per person to
    // decide which one is drawn as the back layer).
    const personFlowData = useMemo(() => {
        if (!summary) return [];
        const byId = new Map(summary.by_person.map((p) => [p.user_id, p]));
        return book.members.map((m) => {
            const spent = byId.get(m.user_id)?.total ?? 0;
            const income = byId.get(m.user_id)?.income ?? 0;
            const spentBigger = spent >= income;
            return {
                name: m.username, spent, income,
                // A bar worth min(spent, income), stacked with a second segment worth the
                // remainder up to max(spent, income), is pixel-identical to the smaller
                // value layered over the start of the larger one - no need for an actual
                // overlapping layout.
                front: Math.min(spent, income),
                back: Math.abs(spent - income),
                frontColor: spentBigger ? INCOME_COLOR : EXPENSE_RED,
                backColor: spentBigger ? EXPENSE_RED : INCOME_COLOR,
            };
        });
    }, [summary, book.members]);

    // Running spend against the running allowance. Uses every bucket the summary returned
    // rather than the table's columns: the table drops to a plain layout past 13 buckets,
    // but a line happily takes a month of days.
    const burnUpData = useMemo(() => {
        const periods = summary?.by_period ?? [];
        if (periods.length < 2) return [];
        const { capped } = allowanceByPeriod(
            budgets, periods.map((p) => p.key), range.from, range.to,
        );
        const labels = periodColumnLabels(periods.map((p) => p.key));
        let spent = 0;
        let allowed = 0;
        return periods.map((p, i) => {
            spent += p.expense;
            allowed += capped[p.key] ?? 0;
            return {
                key: labels[i],
                Spent: Math.round(spent * 100) / 100,
                Budget: Math.round(allowed * 100) / 100,
            };
        });
    }, [summary, budgets, range.from, range.to]);

    // Cap against actual, category by category — the picture the table's Budgeted/Left
    // columns draw in numbers.
    const budgetVsActualData = useMemo(() => {
        const rows = categoryReport.rows
            .filter((r) => r.budgeted !== undefined)
            .sort((a, b) => b.spent - a.spent)
            .slice(0, MAX_BARS);
        return rows.map((r) => ({
            name: r.label,
            Budgeted: Math.round((r.budgeted ?? 0) * 100) / 100,
            Spent: Math.round(r.spent * 100) / 100,
        }));
    }, [categoryReport.rows]);

    // Where the money went, bucket by bucket. Identity is carried by hue here (unlike the
    // magnitude bars), which is why the series are capped at what the palette can separate.
    const compositionData = useMemo(() => {
        const periods = summary?.by_period ?? [];
        if (!summary || periods.length < 2) return { rows: [], series: [] as string[] };

        const ranked = [...summary.by_category].sort((a, b) => b.total - a.total);
        const named = ranked.slice(0, MAX_STACK_SERIES - 1).map((c) => c.category);
        const namedSet = new Set(named);
        const hasOther = ranked.length > named.length || summary.uncategorised.count > 0;
        const series = hasOther ? [...named, "Other"] : named;
        if (series.length < 2) return { rows: [], series: [] };

        const cells = new Map<string, Record<string, number>>();
        for (const cell of summary.by_category_period) {
            const bucket = cells.get(cell.key) ?? {};
            const name = namedSet.has(cell.category) ? cell.category : "Other";
            bucket[name] = (bucket[name] ?? 0) + cell.total;
            cells.set(cell.key, bucket);
        }
        for (const cell of summary.uncategorised_by_period) {
            const bucket = cells.get(cell.key) ?? {};
            bucket.Other = (bucket.Other ?? 0) + cell.total;
            cells.set(cell.key, bucket);
        }

        const labels = periodColumnLabels(periods.map((p) => p.key));
        const rows = periods.map((p, i) => {
            const bucket = cells.get(p.key) ?? {};
            return {
                key: labels[i],
                ...Object.fromEntries(series.map((s) => [s, Math.round((bucket[s] ?? 0) * 100) / 100])),
            };
        });
        return { rows, series };
    }, [summary]);

    const categoryCsvRow = (r: CategoryReportRow) => [
        r.label,
        ...categoryReport.periodKeys.map((k) => r.byPeriod[k] ?? ""),
        r.spent,
        r.budgeted ?? "",
        r.budgeted === undefined ? "" : r.budgeted - r.spent,
    ];

    const summaryCsvRow = (label: string, totals: PeriodTotals) => [
        label,
        ...categoryReport.periodKeys.map((k) => totals.byPeriod[k] ?? 0),
        totals.total,
    ];

    const minusTotals = (a: PeriodTotals, b: PeriodTotals): PeriodTotals => ({
        byPeriod: Object.fromEntries(
            categoryReport.periodKeys.map((k) => [k, (a.byPeriod[k] ?? 0) - (b.byPeriod[k] ?? 0)]),
        ),
        total: a.total - b.total,
    });

    const exportCsv = () => {
        if (!summary) return;
        const rows: unknown[][] = [
            ["XenBudget report", book.name],
            ["From", summary.from, "To", summary.to, "Currency", summary.currency],
            [],
            ["Period", "In", "Out", "Net"],
            ...summary.by_period.map((p) => [p.key, p.income, p.expense, p.net]),
            [],
            // Mirrors the table on screen, period and budget columns included, so the
            // export doesn't quietly say something different from what it was taken from.
            ["Category", ...categoryReport.periodKeys, "Total", "Budgeted", "Left"],
            ...categoryReport.rows.map(categoryCsvRow),
            ...(categoryReport.spanning.length > 0 ? [
                [],
                ["Budgets over several categories (also counted above)"],
                ...categoryReport.spanning.map(categoryCsvRow),
            ] : []),
            [],
            summaryCsvRow("Savings — Save", categoryReport.summary.saved),
            summaryCsvRow("Savings — Goal", categoryReport.summary.goals),
            summaryCsvRow("Savings — Left to save", minusTotals(categoryReport.summary.goals, categoryReport.summary.saved)),
            summaryCsvRow("Budget — Spend", minusTotals(categoryReport.summary.capped, categoryReport.summary.capsLeft)),
            summaryCsvRow("Budget — Cap", categoryReport.summary.capped),
            summaryCsvRow("Budget — Left in budget", categoryReport.summary.capsLeft),
            summaryCsvRow("Income", categoryReport.summary.income),
            summaryCsvRow("Spent", categoryReport.summary.spent),
            summaryCsvRow("Balance", categoryReport.summary.net),
            ...(categoryReport.wholeBook > 0
                ? [["Of which budgeted across the whole book", categoryReport.wholeBook]] : []),
            [],
            ["Person", "Spent", "Income"],
            ...summary.by_person.map((p) => [p.username, p.total, p.income]),
        ];
        downloadCsv(`${book.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`, toCsv(rows));
    };

    if (isLoading && !summary) return <LoadingSpinner message="Building the report..." />;
    if (isError) return <ErrorDisplay error={error} />;
    if (!summary) return null;

    const money = (v: number) => formatCurrency(v, summary.currency);
    const compact = (v: number) => {
        const abs = Math.abs(v);
        if (abs >= 1000) {
            return new Intl.NumberFormat("en-US", {
                style: "currency", currency: summary.currency,
                currencyDisplay: "narrowSymbol",
                notation: "compact", maximumFractionDigits: 1,
            }).format(v);
        }
        return new Intl.NumberFormat("en-US", {
            style: "currency", currency: summary.currency,
            currencyDisplay: "narrowSymbol", maximumFractionDigits: 0,
        }).format(v);
    };
    // Category breakdown grid: cents only when the value actually has them, so whole
    // amounts stay compact while a $12.50 row shows its $12.50.
    const round = (v: number) => new Intl.NumberFormat("en-US", {
        style: "currency", currency: summary.currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(v);
    const tooltipStyle = {
        contentStyle: { background: "#1a1a19", border: "1px solid #ffffff26", borderRadius: 8 },
        labelStyle: { color: "#c3c2b7" },
    };

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ pl: 2, pr: { xs: 2, sm: 3.5 }, pt: 2, flexShrink: 0 }}>
                {/* Two groups pinned apart, rather than relying on TimePeriodFilter's own
                internal spacer - that only pushes its pill right when TimePeriodFilter
                itself is stretched to fill the row, which it isn't here. */}
                <Stack
                    direction="row" alignItems="center" justifyContent="space-between" spacing={1}
                    sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}
                >
                    <Button
                        variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={exportCsv}
                        sx={{ flexShrink: 0 }}
                    >
                        Export CSV
                    </Button>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
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
                        <TimePeriodFilter
                            mode={period} onModeChange={setPeriod}
                            showExtraPresets
                        />
                    </Stack>
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pl: 2, pr: { xs: 2, sm: 3.5 }, pb: 2 }}>
                <Stack spacing={2}>
                    {/* The table IS the report - it leads the page, above the headline
                    strip and every chart, and stays put across both views. Like the
                    charts it hides while there is nothing in the period; the empty state
                    below carries that message instead. */}
                    {summary.totals.count > 0 && (categoryReport.rows.length > 0 || categoryReport.hasBudgets) && (
                        <CategoryReportTable
                            report={categoryReport}
                            money={money}
                            round={round}
                            categoryRegistry={book.categories}
                            rangeLabel={range.label}
                        />
                    )}

                    {summary.totals.count === 0 ? (
                        <Box sx={emptyStateSx}>
                            <Box sx={emptyStateIconCircleSx}><InsightsIcon color="disabled" /></Box>
                            <Typography variant="subtitle1">Nothing in this period</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Try a wider range, or a different currency.
                            </Typography>
                        </Box>
                    ) : (
                        /* The headline numbers are a compact strip, not a chart — three bars
                        would be a worse way to read three numbers. */
                        <TotalsSummary
                            income={summary.totals.income} expense={summary.totals.expense} net={summary.totals.net}
                            currency={summary.currency}
                        />
                    )}

                    {summary.totals.count > 0 && (
                        <>
                            <ChartCard title="Money in and out">
                                <ResponsiveContainer width="100%" height={260}>
                                    {/* Net rides on top of the bars that produce it, rather
                                    than in a card of its own where the relationship has to
                                    be remembered instead of seen. */}
                                    <ComposedChart data={periodData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                                        <CartesianGrid stroke={GRID} vertical={false} />
                                        <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} />
                                        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={AXIS_WIDTH}
                                            tickFormatter={(v) => compact(Number(v))} />
                                        <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: "#ffffff0a" }} />
                                        <Legend />
                                        <Bar dataKey="In" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                                        <Bar dataKey="Out" fill={EXPENSE_RED} radius={[4, 4, 0, 0]} maxBarSize={28} />
                                        <Line
                                            type="monotone" dataKey="Net" stroke={MAGNITUDE_COLOR}
                                            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>

                            {categoryReport.hasBudgets && burnUpData.length > 0 && (
                                <ChartCard title="Spending against budget">
                                    <ResponsiveContainer width="100%" height={240}>
                                        <LineChart data={burnUpData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                                            <CartesianGrid stroke={GRID} vertical={false} />
                                            <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} />
                                            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={AXIS_WIDTH}
                                                tickFormatter={(v) => compact(Number(v))} />
                                            <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} />
                                            <Legend />
                                            {/* The allowance is the line to stay under, so it's
                                            dashed and quiet - a rule, not a measurement. */}
                                            <Line
                                                type="monotone" dataKey="Budget" stroke={BUDGETED_COLOR}
                                                strokeWidth={2} strokeDasharray="5 4" dot={false}
                                            />
                                            <Line
                                                type="monotone" dataKey="Spent" stroke={EXPENSE_RED}
                                                strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <Typography variant="caption" color="text.secondary">
                                        Running totals across {range.label}. Spend above the dashed
                                        line is spend the caps didn&rsquo;t allow for.
                                    </Typography>
                                </ChartCard>
                            )}

                            {budgetVsActualData.length > 0 && (
                                <ChartCard title="Budget vs actual by category">
                                    <ResponsiveContainer width="100%" height={Math.max(160, budgetVsActualData.length * 52)}>
                                        <BarChart
                                            data={budgetVsActualData} layout="vertical"
                                            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                                        >
                                            <CartesianGrid stroke={GRID} horizontal={false} />
                                            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false}
                                                tickFormatter={(v) => compact(Number(v))} />
                                            <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false}
                                                axisLine={false} width={CATEGORY_WIDTH} />
                                            <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: "#ffffff0a" }} />
                                            <Legend />
                                            <Bar dataKey="Budgeted" fill={BUDGETED_COLOR} radius={[0, 4, 4, 0]} maxBarSize={14} />
                                            <Bar dataKey="Spent" fill={EXPENSE_RED} radius={[0, 4, 4, 0]} maxBarSize={14} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                    <Typography variant="caption" color="text.secondary">
                                        Caps scaled to {range.label} — a monthly cap counts once per month covered.
                                    </Typography>
                                </ChartCard>
                            )}

                            {compositionData.rows.length > 0 && (
                                <ChartCard title="Where the money went over time">
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={compositionData.rows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                                            <CartesianGrid stroke={GRID} vertical={false} />
                                            <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} />
                                            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={AXIS_WIDTH}
                                                tickFormatter={(v) => compact(Number(v))} />
                                            <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: "#ffffff0a" }} />
                                            <Legend />
                                            {compositionData.series.map((name) => (
                                                <Bar
                                                    key={name} dataKey={name} stackId="spend"
                                                    fill={name === "Other" ? BUDGETED_COLOR : resolveLabelColor(name, book.categories)}
                                                    maxBarSize={40}
                                                />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartCard>
                            )}

                            {categoryData.length > 0 && (
                                <ChartCard title="Spending by category">
                                    <MagnitudeBars data={categoryData} money={money} compact={compact} colorFor={(d) => d.color} />
                                </ChartCard>
                            )}

                            {needWantData.length > 0 && (
                                <ChartCard title="Needs vs wants">
                                    <NeedWantDonut data={needWantData} money={money} />
                                    <Typography variant="caption" color="text.secondary">
                                        Category totals grouped by their need / want setting. Unclassified
                                        and uncategorised spending is shown as Other.
                                    </Typography>
                                </ChartCard>
                            )}

                            {personFlowData.length > 0 && (
                                <ChartCard title="Spending & income by person">
                                    <PersonFlowBars data={personFlowData} money={money} compact={compact} />
                                    <Typography variant="caption" color="text.secondary">
                                        The larger of the two is the full bar; the smaller sits over the start of it.
                                    </Typography>
                                </ChartCard>
                            )}
                        </>
                    )}

                    {/* Outside the empty-state branch above: with nothing spent the caps
                    are still worth seeing, least of all when the range is empty BECAUSE of
                    a filter. */}
                    {visibleBudgets.length > 0 && (
                        <Box>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.5 }}>
                                Budgets
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                Scaled to {range.label} — a monthly cap counts once per month covered.
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
                                                    currency={budgetStatusResponse?.currency ?? currency}
                                                    categoryRegistry={book.categories}
                                                    members={book.members}
                                                    asOf={budgetStatusResponse?.as_of ?? new Date().toISOString()}
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
                                                    periodLabel={range.label}
                                                />
                                            </Box>
                                        ))}
                                    </Stack>
                                ))}
                            </Box>
                        </Box>
                    )}
                </Stack>
            </Box>
        </Box>
    );
}

/**
 * Horizontal magnitude bars, with the category named on the axis and its value labelled
 * directly - a value readable only by hovering isn't readable at all on a touch screen.
 *
 * `colorFor` gives each bar its own colour (e.g. matching a category's chip); without it
 * every bar takes the flat `color`. Not both at once - past eight distinct colours two
 * would end up indistinguishable anyway, which is `colorFor`'s callers' job to avoid.
 */
function MagnitudeBars<T extends { name: string; total: number }>({
    data, money, compact, color = MAGNITUDE_COLOR, colorFor,
}: {
    data: T[];
    money: (v: number) => string;
    compact: (v: number) => string;
    color?: string;
    colorFor?: (d: T) => string;
}) {
    return (
        <ResponsiveContainer width="100%" height={Math.max(140, data.length * 40)}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: VALUE_LABEL_GUTTER, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false}
                    tickFormatter={(v) => compact(Number(v))} />
                <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false}
                    width={CATEGORY_WIDTH} />
                <Tooltip
                    formatter={(v) => money(Number(v))}
                    cursor={{ fill: "#ffffff0a" }}
                    contentStyle={{ background: "#1a1a19", border: "1px solid #ffffff26", borderRadius: 8 }}
                    labelStyle={{ color: "#c3c2b7" }}
                />
                <Bar
                    dataKey="total" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22}
                    label={{ position: "right", fill: "#c3c2b7", fontSize: 12, formatter: (v: unknown) => money(Number(v)) }}
                >
                    {colorFor && data.map((d, i) => <Cell key={i} fill={colorFor(d)} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

/**
 * One overlapping bar per person: spend and income compared directly rather than as two
 * separate charts. `front` (min of the two) is stacked with `back` (the remainder up to
 * their max) - the smaller value simply paints over the start of the larger one, which
 * looks exactly like a true overlap without needing one. Colour is per-row via `Cell`
 * (whichever of red/green is "the bigger one" flips per person, not per series), and the
 * tooltip reads the row's real spent/income rather than the internal front/back split.
 */
function PersonFlowBars({ data, money, compact }: {
    data: { name: string; spent: number; income: number; front: number; back: number; frontColor: string; backColor: string }[];
    money: (v: number) => string;
    compact: (v: number) => string;
}) {
    return (
        <ResponsiveContainer width="100%" height={Math.max(140, data.length * 40)}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false}
                    tickFormatter={(v) => compact(Number(v))} />
                <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false}
                    width={CATEGORY_WIDTH} />
                <Tooltip
                    cursor={{ fill: "#ffffff0a" }}
                    contentStyle={{ background: "#1a1a19", border: "1px solid #ffffff26", borderRadius: 8 }}
                    labelStyle={{ color: "#c3c2b7" }}
                    content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as (typeof data)[number];
                        return (
                            <Box sx={{
                                bgcolor: "#1a1a19", border: "1px solid #ffffff26", borderRadius: 1,
                                px: 1.25, py: 0.75,
                            }}>
                                <Typography variant="caption" sx={{ display: "block", color: "#c3c2b7" }}>{row.name}</Typography>
                                <Typography variant="caption" sx={{ display: "block", color: EXPENSE_RED }}>
                                    Spent {money(row.spent)}
                                </Typography>
                                <Typography variant="caption" sx={{ display: "block", color: INCOME_COLOR }}>
                                    Income {money(row.income)}
                                </Typography>
                            </Box>
                        );
                    }}
                />
                {/* The real series ("front"/"back") don't mean anything on their own -
                which one is red vs. green flips per person - so the legend is drawn by
                hand rather than from the series recharts would otherwise infer. */}
                <Legend content={() => (
                    <Stack direction="row" justifyContent="center" spacing={2} sx={{ pt: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: EXPENSE_RED }} />
                            <Typography variant="caption" color="text.secondary">Spent</Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: INCOME_COLOR }} />
                            <Typography variant="caption" color="text.secondary">Income</Typography>
                        </Stack>
                    </Stack>
                )} />
                <Bar dataKey="front" stackId="flow" radius={[4, 0, 0, 4]} maxBarSize={22}>
                    {data.map((d, i) => <Cell key={i} fill={d.frontColor} />)}
                </Bar>
                <Bar dataKey="back" stackId="flow" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {data.map((d, i) => <Cell key={i} fill={d.backColor} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

/**
 * Donut of spending split by need vs want, with the needs share in the middle. Other is
 * the tail of unclassified categories plus anything uncategorised — kept so the two
 * slices don't silently pretend to be the whole pie.
 */
function NeedWantDonut({ data, money }: {
    data: { name: string; total: number; color: string }[];
    money: (v: number) => string;
}) {
    const total = data.reduce((sum, d) => sum + d.total, 0);
    const needs = data.find((d) => d.name === "Needs")?.total ?? 0;
    const needsShare = total > 0 ? Math.round((needs / total) * 100) : 0;
    // Zero-value slices would draw nothing but can still trip up the angle maths; the
    // legend below keeps showing them regardless.
    const slices = data.filter((d) => d.total > 0);
    return (
        <Box>
            <Box sx={{ position: "relative", height: 220, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                        <Pie
                            data={slices} dataKey="total" nameKey="name"
                            innerRadius={60} outerRadius={90} paddingAngle={2} stroke="none"
                        >
                            {slices.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Pie>
                        <Tooltip
                            formatter={(v) => money(Number(v))}
                            contentStyle={{ background: "#1a1a19", border: "1px solid #ffffff26", borderRadius: 8 }}
                            labelStyle={{ color: "#c3c2b7" }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <Box sx={{
                    position: "absolute", inset: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", pointerEvents: "none",
                }}>
                    <Box sx={{ textAlign: "center" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>{needsShare}%</Typography>
                        <Typography variant="caption" color="text.secondary">needs</Typography>
                    </Box>
                </Box>
            </Box>
            <Stack direction="row" justifyContent="center" spacing={2} sx={{ pt: 1, flexWrap: "wrap", rowGap: 0.5 }}>
                {data.map((d) => (
                    <Stack key={d.name} direction="row" alignItems="center" spacing={0.5}>
                        <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: d.color }} />
                        <Typography variant="caption" color="text.secondary">
                            {d.name} · {money(d.total)}
                        </Typography>
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1.5 }}>{title}</Typography>
            {children}
        </Card>
    );
}

