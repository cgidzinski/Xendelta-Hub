import { Box, Card, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import { formatCurrency } from "../../currency";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import type { BookProjection } from "./bookPace";

interface ProjectionCardProps {
    projection: BookProjection;
    currency: string;
    /** What the window is called on screen, e.g. "August" — so the figure names its period. */
    periodLabel: string;
}

/**
 * Where the book lands by the end of the period: the one number that answers "am I okay
 * this month" without reading every budget bar.
 *
 * Renders nothing once the window has closed. A finished period has a result, not a
 * projection, and the In/Out/Net strip above already states it.
 */
export default function ProjectionCard({ projection, currency, periodLabel }: ProjectionCardProps) {
    if (projection.finished) return null;

    const { projectedNet, projectedExpense, committed, income } = projection;
    const negative = projectedNet < 0;
    const elapsedPercent = Math.round(projection.elapsed * 100);

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.75, mb: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
                <Typography variant="caption" sx={sectionLabelSx}>Projected</Typography>
                <Typography variant="caption" color="text.secondary">
                    {elapsedPercent}% through {periodLabel}
                </Typography>
            </Stack>

            <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.75 }}>
                <TrendingFlatIcon
                    sx={{ fontSize: 18, color: negative ? "error.main" : INCOME_COLOR, flexShrink: 0 }}
                />
                <Typography
                    variant="h6"
                    sx={{ color: negative ? "error.main" : INCOME_COLOR, fontWeight: 700, lineHeight: 1.2 }}
                    noWrap
                >
                    {negative ? "−" : "+"}{formatCurrency(Math.abs(projectedNet), currency)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                    by the end of {periodLabel}
                </Typography>
            </Stack>

            <LinearProgress
                variant="determinate"
                value={Math.min(100, elapsedPercent)}
                sx={{ height: 4, borderRadius: 1, mb: 1 }}
            />

            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {formatCurrency(income, currency)} in so far, and{" "}
                <Tooltip title="Whichever is larger: carrying on at this rate, or what's already spent plus the recurring charges still due. Never both added together.">
                    <Box component="span" sx={{ textDecoration: "underline dotted", cursor: "help" }}>
                        {formatCurrency(projectedExpense, currency)} out
                    </Box>
                </Tooltip>
                {" "}projected
                {committed > 0 && ` · ${formatCurrency(committed, currency)} of that is recurring and not yet posted`}.
                {" "}Income isn't extrapolated.
            </Typography>
        </Card>
    );
}
