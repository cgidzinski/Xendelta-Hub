import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box, Button, Card, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow,
    TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import InsightsIcon from "@mui/icons-material/Insights";
import {
    Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
    Tooltip, XAxis, YAxis,
} from "recharts";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetSummary } from "../../../hooks/xenbudget/useSummary";
import { useXenBudgetStatus } from "../../../hooks/xenbudget/useBudgets";
import TimePeriodFilter, { defaultYearMode, resolvePeriod, type PeriodMode } from "./components/TimePeriodFilter";
import TotalsSummary from "./components/TotalsSummary";
import BudgetCard from "./components/budget/BudgetCard";
import { sortBudgets } from "./components/budget/sortBudgets";
import { budgetsForPerson } from "./components/budget/budgetPersonView";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { formatCurrency, STABLE_CURRENCY_MENU_PROPS } from "../../../utils/currencyUtils";
import { toCsv, downloadCsv } from "../../../utils/csvMapping";
import { EXPENSE_COLOR, INCOME_COLOR, MAGNITUDE_COLOR } from "../../../components/ui/chartColors";
import { cardSx, sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../components/ui/surfaceStyles";

// Past this many categories a bar chart stops being readable, so the tail is folded into
// a single "Other" bar rather than adding more rows nobody can compare.
const MAX_BARS = 8;

const AXIS = { stroke: "#8b8b85", fontSize: 12 } as const;
const GRID = "#ffffff14";
// Axis ticks are for scanning, so they're abbreviated — a full "CA$8,000.00" needs a
// gutter wide enough to squeeze the plot, and gets truncated if it doesn't get one.
// Exact figures live on the direct labels, the tooltip and the table view.
const AXIS_WIDTH = 60;
// Wide enough for the longest formatted value sitting to the right of the longest bar;
// at 72 the top bar's label was clipped by the container edge.
const VALUE_LABEL_GUTTER = 104;
const CATEGORY_WIDTH = 132;

export default function BookReport() {
    const { book, currency, onCurrencyChange, person, onPersonChange } = useOutletContext<BookDetailContext>();
    const [period, setPeriod] = useState<PeriodMode>(defaultYearMode);
    const [view, setView] = useState<"charts" | "table">("charts");

    const range = useMemo(() => resolvePeriod(period), [period]);

    const { summary, isLoading, isError, error } = useXenBudgetSummary(book._id, {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        group_by: range.groupBy,
        currency,
        people: person ? [person] : undefined,
    });
    const { status: budgetStatusResponse, budgets } = useXenBudgetStatus(book._id, currency);
    // Narrowed by the person filter the same way the charts above are: the budgets that
    // constrain them, carrying only their own personal limit.
    const visibleBudgets = useMemo(
        () => sortBudgets(person ? budgetsForPerson(budgets, person) : budgets),
        [budgets, person],
    );

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

    const categoryData = useMemo(() => {
        if (!summary) return [];
        const rows = summary.by_category.map((c) => ({ total: c.total, category: c.category }));
        if (summary.uncategorised.count > 0) {
            rows.push({ total: summary.uncategorised.total, category: "Uncategorised" });
        }
        return foldTail(rows, (r) => r.category);
    }, [summary]);

    const personData = useMemo(() => {
        if (!summary) return [];
        const byId = new Map(summary.by_person.map((p) => [p.user_id, p]));
        return foldTail(
            book.members.map((m) => ({ total: byId.get(m.user_id)?.total ?? 0, name: m.username })),
            (r) => r.name,
        );
    }, [summary, book.members]);

    const personIncomeData = useMemo(() => {
        if (!summary) return [];
        const byId = new Map(summary.by_person.map((p) => [p.user_id, p]));
        return foldTail(
            book.members.map((m) => ({ total: byId.get(m.user_id)?.income ?? 0, name: m.username })),
            (r) => r.name,
        );
    }, [summary, book.members]);

    const exportCsv = () => {
        if (!summary) return;
        const rows: unknown[][] = [
            ["XenBudget report", book.name],
            ["From", summary.from, "To", summary.to, "Currency", summary.currency],
            [],
            ["Period", "In", "Out", "Net"],
            ...summary.by_period.map((p) => [p.key, p.income, p.expense, p.net]),
            [],
            ["Category", "Spent"],
            ...summary.by_category.map((c) => [c.category, c.total]),
            ["Uncategorised", summary.uncategorised.total],
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
                notation: "compact", maximumFractionDigits: 1,
            }).format(v);
        }
        return new Intl.NumberFormat("en-US", {
            style: "currency", currency: summary.currency, maximumFractionDigits: 0,
        }).format(v);
    };
    const tooltipStyle = {
        contentStyle: { background: "#1a1a19", border: "1px solid #ffffff26", borderRadius: 8 },
        labelStyle: { color: "#c3c2b7" },
    };

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ px: 2, pt: 2, flexShrink: 0 }}>
                <Stack spacing={1} sx={{ mb: 2 }}>
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
                        showExtraPresets
                    />
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                    <ToggleButtonGroup
                        size="small" exclusive value={view}
                        onChange={(_, v) => v && setView(v)}
                    >
                        <ToggleButton value="charts">Charts</ToggleButton>
                        <ToggleButton value="table">Table</ToggleButton>
                    </ToggleButtonGroup>
                    <Button size="small" startIcon={<DownloadIcon />} onClick={exportCsv}>
                        Export CSV
                    </Button>
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, pb: 2 }}>
                <Stack spacing={2}>
                    {summary.totals.count === 0 ? (
                        <Box sx={emptyStateSx}>
                            <Box sx={emptyStateIconCircleSx}><InsightsIcon color="disabled" /></Box>
                            <Typography variant="subtitle1">Nothing in this period</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Try a wider range, or a different currency.
                            </Typography>
                        </Box>
                    ) : (
                        <>
                            {/* The headline numbers are a compact strip, not a chart — three bars
                            would be a worse way to read three numbers. */}
                            <TotalsSummary
                                income={summary.totals.income} expense={summary.totals.expense} net={summary.totals.net}
                                currency={summary.currency}
                            />

                            {view === "table" ? (
                                <ReportTable summary={summary} money={money} />
                            ) : (
                                <>
                                    <ChartCard title="Money in and out">
                                        <ResponsiveContainer width="100%" height={260}>
                                            <BarChart data={periodData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                                                <CartesianGrid stroke={GRID} vertical={false} />
                                                <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} />
                                                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={AXIS_WIDTH}
                                                    tickFormatter={(v) => compact(Number(v))} />
                                                <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: "#ffffff0a" }} />
                                                <Legend />
                                                {/* Two series, so identity is carried by a legend as well as colour. */}
                                                <Bar dataKey="In" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                <Bar dataKey="Out" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </ChartCard>

                                    <ChartCard title="Net by period">
                                        <ResponsiveContainer width="100%" height={220}>
                                            <LineChart data={periodData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                                                <CartesianGrid stroke={GRID} vertical={false} />
                                                <XAxis dataKey="key" tick={AXIS} tickLine={false} axisLine={false} />
                                                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={AXIS_WIDTH}
                                                    tickFormatter={(v) => compact(Number(v))} />
                                                <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} />
                                                {/* One series — the card title names it, so no legend box. */}
                                                <Line
                                                    type="monotone" dataKey="Net" stroke={MAGNITUDE_COLOR}
                                                    strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </ChartCard>

                                    {categoryData.length > 0 && (
                                        <ChartCard title="Spending by category">
                                            <MagnitudeBars data={categoryData} money={money} compact={compact} />
                                        </ChartCard>
                                    )}

                                    {!person && personData.length > 0 && (
                                        <ChartCard title="Spending by person">
                                            <MagnitudeBars data={personData} money={money} compact={compact} />
                                            <Typography variant="caption" color="text.secondary">
                                                Each person&rsquo;s share of every expense — these add up to the total above.
                                            </Typography>
                                        </ChartCard>
                                    )}

                                    {!person && personIncomeData.length > 0 && (
                                        <ChartCard title="Income by person">
                                            <MagnitudeBars data={personIncomeData} money={money} compact={compact} color={INCOME_COLOR} />
                                            <Typography variant="caption" color="text.secondary">
                                                Each person&rsquo;s share of every income — these add up to the total above.
                                            </Typography>
                                        </ChartCard>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {/* Outside the empty-state branch above: a budget is measured over its
                    own current period, so an empty report range is no reason for it to
                    disappear - least of all when the range is empty BECAUSE of the person
                    filter. */}
                    {visibleBudgets.length > 0 && (
                        <Box>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.5 }}>
                                Budgets right now
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                Each budget&rsquo;s own period, not the report range above.
                            </Typography>
                            <Box sx={{
                                display: "grid",
                                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                                gap: 1,
                                alignItems: "start",
                            }}>
                                {visibleBudgets.map((budget) => (
                                    <BudgetCard
                                        key={budget._id} budget={budget}
                                        currency={budgetStatusResponse?.currency ?? currency}
                                        categoryRegistry={book.categories}
                                        members={book.members}
                                        asOf={budgetStatusResponse?.as_of ?? new Date().toISOString()}
                                        personId={person}
                                    />
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
 * Horizontal magnitude bars in a single hue, with the category named on the axis and its
 * value labelled directly.
 *
 * A colour per category would have to start reusing hues once a book has more than eight
 * categories, leaving two of them indistinguishable; and a value readable only by hovering
 * isn't readable at all on a touch screen.
 */
function MagnitudeBars({ data, money, compact, color = MAGNITUDE_COLOR }: {
    data: { name: string; total: number }[];
    money: (v: number) => string;
    compact: (v: number) => string;
    color?: string;
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
                />
            </BarChart>
        </ResponsiveContainer>
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

/** Every figure in the charts, readable without hovering. */
function ReportTable({ summary, money }: {
    summary: NonNullable<ReturnType<typeof useXenBudgetSummary>["summary"]>;
    money: (v: number) => string;
}) {
    return (
        <Card variant="outlined" sx={{ ...cardSx, overflowX: "auto" }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Period</TableCell>
                        <TableCell align="right">In</TableCell>
                        <TableCell align="right">Out</TableCell>
                        <TableCell align="right">Net</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {summary.by_period.map((p) => (
                        <TableRow key={p.key}>
                            <TableCell>{p.key}</TableCell>
                            <TableCell align="right">{money(p.income)}</TableCell>
                            <TableCell align="right">{money(p.expense)}</TableCell>
                            <TableCell align="right">{money(p.net)}</TableCell>
                        </TableRow>
                    ))}
                    <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{money(summary.totals.income)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{money(summary.totals.expense)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{money(summary.totals.net)}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </Card>
    );
}
