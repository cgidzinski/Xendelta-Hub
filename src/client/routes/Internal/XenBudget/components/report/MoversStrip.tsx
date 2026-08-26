import { Box, Card, Stack, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import type { XenBudgetLabel } from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import { formatCurrency } from "../../currency";
import { periodColumnLabels } from "./periodColumns";
import { EXPENSE_RED, INCOME_COLOR } from "../../../../../components/ui/chartColors";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import type { Mover, Movers } from "./movers";

interface MoversStripProps {
    movers: Movers;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
}

/**
 * "Groceries up $142 versus last month" — the subtraction the two-column table was always
 * asking the reader to do in their head.
 *
 * Up is red and down is green, which is the opposite of a stock ticker and the right way
 * round for a budget: spending more is the bad news.
 */
export default function MoversStrip({ movers, currency, categoryRegistry }: MoversStripProps) {
    if (movers.up.length === 0 && movers.down.length === 0) return null;

    // The same headings the table's columns carry, so "vs Jul" names a column on screen.
    const [previousLabel, currentLabel] = periodColumnLabels([movers.previousKey, movers.currentKey]);

    const row = (mover: Mover, direction: "up" | "down") => {
        const isUp = direction === "up";
        const color = isUp ? EXPENSE_RED : INCOME_COLOR;
        return (
            <Stack
                key={mover.category}
                direction="row" alignItems="center" spacing={1}
                sx={{ minWidth: 0 }}
            >
                {isUp
                    ? <ArrowUpwardIcon sx={{ fontSize: 14, color, flexShrink: 0 }} />
                    : <ArrowDownwardIcon sx={{ fontSize: 14, color, flexShrink: 0 }} />}
                <CategoryChip name={mover.category} registry={categoryRegistry} />
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="body2" noWrap sx={{ color, fontWeight: 600, flexShrink: 0 }}>
                    {isUp ? "+" : "−"}{formatCurrency(Math.abs(mover.delta), currency)}
                </Typography>
                <Typography
                    variant="caption" color="text.secondary" noWrap
                    sx={{ flexShrink: 0, width: 52, textAlign: "right" }}
                >
                    {/* Nothing to divide by when the category started from zero — "new"
                    says what happened, where "+100%" would be arithmetic fiction. */}
                    {mover.percent === null ? "new" : `${Math.round(mover.percent * 100)}%`}
                </Typography>
            </Stack>
        );
    };

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.25 }}>
                What changed
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                {currentLabel} vs {previousLabel}
            </Typography>
            <Box sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
                gap: { xs: 1.5, sm: 3 },
                alignItems: "start",
            }}>
                {movers.up.length > 0 && (
                    <Stack spacing={1}>
                        <Typography variant="caption" color="text.secondary">Spent more on</Typography>
                        {movers.up.map((m) => row(m, "up"))}
                    </Stack>
                )}
                {movers.down.length > 0 && (
                    <Stack spacing={1}>
                        <Typography variant="caption" color="text.secondary">Spent less on</Typography>
                        {movers.down.map((m) => row(m, "down"))}
                    </Stack>
                )}
            </Box>
        </Card>
    );
}
