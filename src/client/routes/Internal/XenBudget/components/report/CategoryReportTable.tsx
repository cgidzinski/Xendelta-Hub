import {
    Box, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, alpha,
} from "@mui/material";
import type { CategoryReport, CategoryReportRow } from "./categoryReportRows";
import { CategoryChip } from "../LabelChip";
import type { XenBudgetLabel } from "../../../../../hooks/xenbudget/types";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";

interface CategoryReportTableProps {
    report: CategoryReport;
    /** Expense and income for the same range, straight from the summary. */
    expense: number;
    income: number;
    net: number;
    money: (v: number) => string;
    categoryRegistry: XenBudgetLabel[];
    /** Human-readable range, e.g. "2026" or "Aug 1 - Aug 31". */
    rangeLabel: string;
}

/**
 * Budget against actual, category by category, with the book's bottom line underneath.
 *
 * The budget column is every cap RESTATED for the range being reported on (see
 * budgetedForRange) - a monthly cap read over a year is that cap twelve times, not $800.
 * The header says so, because a budget figure that silently means something other than
 * what the row above it means is worse than no column at all.
 */
export default function CategoryReportTable({
    report, expense, income, net, money, categoryRegistry, rangeLabel,
}: CategoryReportTableProps) {
    const { rows, spanning, wholeBook, totalBudgeted, hasBudgets } = report;

    const difference = (row: CategoryReportRow) =>
        row.budgeted === undefined ? undefined : row.budgeted - row.spent;

    const cell = (value: number | undefined) => (value === undefined ? "—" : money(value));

    const differenceCell = (value: number | undefined) => {
        if (value === undefined) return <TableCell align="right">—</TableCell>;
        const over = value < 0;
        return (
            <TableCell align="right" sx={{ color: over ? "error.main" : "text.secondary" }}>
                {over ? `−${money(-value)}` : money(value)}
            </TableCell>
        );
    };

    const dataRow = (row: CategoryReportRow, showChip: boolean) => (
        <TableRow key={row.key}>
            <TableCell sx={{ maxWidth: 180 }}>
                {showChip && row.categories.length === 1
                    ? <CategoryChip name={row.categories[0]} registry={categoryRegistry} />
                    : <Typography variant="body2">{row.label}</Typography>}
            </TableCell>
            {hasBudgets && <TableCell align="right">{cell(row.budgeted)}</TableCell>}
            <TableCell align="right">{money(row.spent)}</TableCell>
            {hasBudgets && differenceCell(difference(row))}
        </TableRow>
    );

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.5 }}>
                Category breakdown
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                {hasBudgets
                    ? `Budgets scaled to ${rangeLabel} — a monthly cap counts once per month covered.`
                    : `Spending across ${rangeLabel}.`}
            </Typography>

            {/* Wide content scrolls inside its own box rather than pushing the page sideways. */}
            <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Category</TableCell>
                            {hasBudgets && <TableCell align="right">Budgeted</TableCell>}
                            <TableCell align="right">Spent</TableCell>
                            {hasBudgets && <TableCell align="right">Left</TableCell>}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => dataRow(row, row.categories.length === 1))}

                        {spanning.length > 0 && (
                            <>
                                <TableRow>
                                    <TableCell
                                        colSpan={hasBudgets ? 4 : 2}
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
                    </TableBody>
                </Table>
            </Box>

            <Stack
                spacing={0.5}
                sx={{
                    mt: 2, pt: 1.5,
                    borderTop: "1px solid",
                    borderColor: (theme) => alpha(theme.palette.text.primary, 0.12),
                }}
            >
                {hasBudgets && (
                    <>
                        {wholeBook > 0 && (
                            <TotalRow label="Whole-book budgets" value={money(wholeBook)} muted />
                        )}
                        <TotalRow label="Budgeted" value={money(totalBudgeted)} muted />
                        <TotalRow label="Spent" value={money(expense)} muted />
                        <TotalRow
                            label="Budget net"
                            value={totalBudgeted - expense < 0
                                ? `−${money(expense - totalBudgeted)}`
                                : money(totalBudgeted - expense)}
                            color={totalBudgeted - expense < 0 ? "error.main" : INCOME_COLOR}
                        />
                    </>
                )}
                {!hasBudgets && <TotalRow label="Spent" value={money(expense)} muted />}
                <TotalRow label="Income" value={money(income)} color={INCOME_COLOR} muted />
                <TotalRow
                    label="Net"
                    value={net < 0 ? `−${money(-net)}` : `+${money(net)}`}
                    color={net < 0 ? "error.main" : INCOME_COLOR}
                />
            </Stack>
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
