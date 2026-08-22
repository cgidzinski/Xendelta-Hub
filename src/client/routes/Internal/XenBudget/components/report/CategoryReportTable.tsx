import {
    Box, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, alpha,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import type { CategoryReport, CategoryReportRow, PeriodTotals } from "./categoryReportRows";
import { periodColumnLabels } from "./periodColumns";
import { CategoryChip } from "../LabelChip";
import type { XenBudgetLabel } from "../../../../../hooks/xenbudget/types";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";

interface CategoryReportTableProps {
    report: CategoryReport;
    money: (v: number) => string;
    /** Whole units, no cents - the grid has too many columns to spend width on decimals. */
    round: (v: number) => string;
    categoryRegistry: XenBudgetLabel[];
    /** Human-readable range, e.g. "2026" or "Aug 1 - Aug 31". */
    rangeLabel: string;
}

/**
 * Budget against actual, category by category, with the book's bottom line underneath.
 *
 * Over a range of several periods it becomes a grid - a column per month of a year, per
 * week of a quarter - because "what did groceries cost" and "when did it cost it" are
 * different questions and the second one is what a report is for. A single month groups
 * by day, which is too many columns to read, so that keeps the plain layout.
 *
 * The budget column is every cap RESTATED for the range being reported on (see
 * budgetedForRange): a monthly cap read over a year is that cap twelve times, not $800.
 * The caption says so, because a budget figure that silently means something other than
 * the row beside it is worse than no column at all.
 */
export default function CategoryReportTable({
    report, money, round, categoryRegistry, rangeLabel,
}: CategoryReportTableProps) {
    const { rows, spanning, wholeBook, hasBudgets, periodKeys, summary } = report;
    const pivoted = periodKeys.length > 0;
    const columnLabels = periodColumnLabels(periodKeys);

    // The name column stays put while the periods scroll under it - a row of figures with
    // its label scrolled off the screen says nothing.
    const stickySx: SxProps<Theme> = {
        position: "sticky",
        left: 0,
        bgcolor: "background.paper",
        zIndex: 1,
        minWidth: 120,
        maxWidth: 170,
        overflow: "hidden",
    };

    const leftCell = (row: CategoryReportRow) => {
        if (row.budgeted === undefined) {
            return <TableCell align="right" sx={{ color: "text.disabled" }}>—</TableCell>;
        }
        const left = row.budgeted - row.spent;
        return (
            <TableCell align="right" sx={{ color: left < 0 ? "error.main" : "text.secondary" }}>
                {left < 0 ? `−${round(-left)}` : round(left)}
            </TableCell>
        );
    };

    const dataRow = (row: CategoryReportRow, showChip: boolean) => (
        <TableRow key={row.key}>
            <TableCell sx={stickySx}>
                {showChip && row.categories.length === 1
                    ? <CategoryChip name={row.categories[0]} registry={categoryRegistry} />
                    : <Typography variant="body2" noWrap>{row.label}</Typography>}
            </TableCell>
            {periodKeys.map((periodKey) => {
                const value = row.byPeriod[periodKey] ?? 0;
                // A grid of zeroes reads as noise, but a blank cell is ambiguous - it
                // could equally be a figure that failed to load. A dimmed dash says
                // "nothing here" out loud, and matches the dash the budget columns
                // already use for the same meaning.
                const empty = value === 0;
                return (
                    <TableCell
                        key={periodKey} align="right"
                        sx={{ color: empty ? "text.disabled" : "text.secondary" }}
                    >
                        {empty ? "—" : round(value)}
                    </TableCell>
                );
            })}
            <TableCell align="right" sx={{ fontWeight: pivoted ? 600 : 400 }}>
                {pivoted ? round(row.spent) : money(row.spent)}
            </TableCell>
            {hasBudgets && (
                <TableCell align="right">
                    {row.budgeted === undefined
                        ? <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
                        : (pivoted ? round(row.budgeted) : money(row.budgeted))}
                </TableCell>
            )}
            {hasBudgets && leftCell(row)}
        </TableRow>
    );

    const columnCount = 1 + periodKeys.length + 1 + (hasBudgets ? 2 : 0);

    /**
     * A measure across every column. `first` draws the rule that separates the bottom
     * block from the categories; `signed` marks the figures that can legitimately go
     * either way, where the sign is the whole point.
     */
    const totalRow = (
        label: string,
        totals: PeriodTotals,
        opts: { first?: boolean; signed?: boolean; strong?: boolean; color?: string } = {},
    ) => {
        const border = opts.first
            ? {
                borderTop: "2px solid",
                borderTopColor: (theme: Theme) => alpha(theme.palette.text.primary, 0.24),
            }
            : {};
        const tint = (v: number) => {
            if (opts.color) return opts.color;
            if (!opts.signed) return "text.primary";
            return v < 0 ? "error.main" : INCOME_COLOR;
        };
        const show = (v: number) => {
            if (v === 0) return round(0);
            return opts.signed && v < 0 ? `−${round(-v)}` : round(v);
        };

        return (
            <TableRow key={label}>
                <TableCell sx={{ ...stickySx, ...border, fontWeight: 600 }}>
                    <Typography variant="caption" sx={{ ...sectionLabelSx, color: "text.secondary" }}>
                        {label}
                    </Typography>
                </TableCell>
                {periodKeys.map((periodKey) => {
                    const value = totals.byPeriod[periodKey] ?? 0;
                    return (
                        <TableCell
                            key={periodKey} align="right"
                            sx={{ ...border, color: tint(value) }}
                        >
                            {show(value)}
                        </TableCell>
                    );
                })}
                <TableCell
                    align="right"
                    sx={{
                        ...border,
                        color: tint(totals.total),
                        fontWeight: opts.strong ? 700 : 600,
                    }}
                >
                    {opts.signed && totals.total > 0 ? `+${round(totals.total)}` : show(totals.total)}
                </TableCell>
                {/* The Budgeted and Left columns are a category-level comparison; the
                budget's own totals are the rows themselves, so repeating them here would
                just be the same number twice. */}
                {hasBudgets && <TableCell sx={border} />}
                {hasBudgets && <TableCell sx={border} />}
            </TableRow>
        );
    };

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.5 }}>
                Category breakdown
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                {hasBudgets
                    ? `Budgets scaled to ${rangeLabel} — a monthly cap counts once per month covered.`
                    : `Spending across ${rangeLabel}.`}
                {pivoted && " Figures rounded to whole amounts."}
            </Typography>

            {/* Wide content scrolls inside its own box rather than pushing the page sideways. */}
            <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ "& td, & th": { whiteSpace: "nowrap" } }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={stickySx}>Category</TableCell>
                            {columnLabels.map((label, i) => (
                                <TableCell key={periodKeys[i]} align="right">{label}</TableCell>
                            ))}
                            <TableCell align="right">{pivoted ? "Total" : "Spent"}</TableCell>
                            {hasBudgets && <TableCell align="right">Budgeted</TableCell>}
                            {hasBudgets && <TableCell align="right">Left</TableCell>}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => dataRow(row, row.categories.length === 1))}

                        {spanning.length > 0 && (
                            <>
                                <TableRow>
                                    <TableCell
                                        colSpan={columnCount}
                                        sx={{ borderBottom: "none", pt: 2, pb: 0.5 }}
                                    >
                                        <Typography variant="caption" sx={sectionLabelSx}>
                                            Budgets over several categories
                                        </Typography>
                                        {/* Their spend is money already on the rows above, so
                                        saying it once here stops the column from reading like
                                        it should add up with them. */}
                                        <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
                                            Also counted above; the totals below count each purchase once.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                                {spanning.map((row) => dataRow(row, false))}
                            </>
                        )}

                        {/* The bottom line, carried across the same columns as everything
                        above it - a year's spending is worth reading month by month, and
                        so is what it left over. */}
                        {hasBudgets && (
                            <>
                                {totalRow("Budgeted", summary.budgeted, { first: true })}
                                {totalRow("Spent", summary.spent)}
                                {totalRow("Budget net", summary.budgetNet, { signed: true })}
                                {totalRow("Income", summary.income, { color: INCOME_COLOR })}
                                {totalRow("Net", summary.net, { signed: true, strong: true })}
                            </>
                        )}
                        {!hasBudgets && (
                            <>
                                {totalRow("Spent", summary.spent, { first: true })}
                                {totalRow("Income", summary.income, { color: INCOME_COLOR })}
                                {totalRow("Net", summary.net, { signed: true, strong: true })}
                            </>
                        )}
                    </TableBody>
                </Table>
            </Box>

            {wholeBook > 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
                    Budgeted includes {money(wholeBook)} capping the whole book rather than any
                    one category.
                </Typography>
            )}

        </Card>
    );
}

function TotalRow({ label, value, color, muted }: {
    label: string;
    value: string;
    color?: string;
    muted?: boolean;
}) {
    return (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography
                variant="caption"
                sx={{ ...sectionLabelSx, color: muted ? "text.disabled" : "text.secondary" }}
            >
                {label}
            </Typography>
            <Typography
                variant={muted ? "body2" : "subtitle2"}
                noWrap
                sx={{ flexShrink: 0, fontWeight: muted ? 400 : 700, color: color ?? "text.primary" }}
            >
                {value}
            </Typography>
        </Stack>
    );
}
