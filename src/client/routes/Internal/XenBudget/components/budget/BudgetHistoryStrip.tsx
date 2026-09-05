import { Box, Stack, Tooltip, Typography, alpha } from "@mui/material";
import type { BudgetPeriodResult } from "../../../../../hooks/xenbudget/types";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";
import { formatCurrency } from "../../currency";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import type { LimitDirection } from "./budgetKind";
import { columnLabel, historyMargins } from "./historyMargins";

interface BudgetHistoryStripProps {
    periods: BudgetPeriodResult[];
    direction: LimitDirection;
    currency: string;
    asOf: string;
}

/** Half the strip's height, so a bar grows from the zero rule in either direction. */
const HALF = 24;
const COLUMN_WIDTH = 30;
const GAP = 6;

/**
 * How far under or over, period by period.
 *
 * One month's verdict is a fact; six of them is a pattern, and the pattern is the thing
 * worth knowing - a cap you miss every single month is a cap that is wrong, not a run of
 * bad luck. Drawn as signed bars around a zero rule rather than a row of ticks because
 * the MAGNITUDE is where the warning lives: a budget you are creeping up on shows its
 * bars shrinking months before the first one crosses the line.
 *
 * Position carries the pass/fail, not just colour - a bar below the rule is a pass
 * whichever way you see the two hues.
 */
export default function BudgetHistoryStrip({
    periods, direction, currency, asOf,
}: BudgetHistoryStripProps) {
    const { columns, passed, judged, streak, peak } = historyMargins(periods, direction, asOf);
    const money = (v: number) => formatCurrency(v, currency);

    // One column says nothing a bar hasn't already said. The strip exists to show a run.
    if (columns.length < 2) return null;

    const wordFor = (margin: number) => {
        if (direction === "floor") {
            return margin >= 0 ? `${money(margin)} past target` : `${money(-margin)} short`;
        }
        return margin >= 0 ? `${money(margin)} under` : `${money(-margin)} over`;
    };

    const describe = (c: typeof columns[number]) => {
        const when = columnLabel(c.from, c.to);
        if (c.quiet || c.margin === undefined) return `${when}: no activity`;
        return `${when}: ${wordFor(c.margin)}${c.open ? " so far" : ""}`;
    };

    return (
        <Box>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                Margin per period
            </Typography>

            <Stack
                direction="row"
                spacing={`${GAP}px`}
                role="img"
                aria-label={`Margin by period. ${columns.map(describe).join(". ")}.`}
            >
                {columns.map((c) => {
                    const height = c.margin === undefined || c.quiet
                        ? 0
                        : Math.max(3, Math.round((Math.abs(c.margin) / peak) * (HALF - 3)));
                    const good = (c.margin ?? 0) >= 0;
                    // Colour always means the same thing - green passed, red didn't - but
                    // which SIDE of the rule a bar sits on follows the budget's direction,
                    // because that is what reads naturally: under a limit is below the
                    // line, past a target is above it. Pinning both to one side would
                    // leave every savings strip drawing "went past the target" downward.
                    const above = direction === "floor" ? good : !good;
                    return (
                        <Tooltip key={c.from} title={describe(c)} enterTouchDelay={0}>
                            <Box sx={{ width: COLUMN_WIDTH, flexShrink: 0 }}>
                                <Box sx={{ position: "relative", height: HALF * 2 }}>
                                    {/* The rule is the budget's amount: on it exactly, no
                                    bar is drawn either way. */}
                                    <Box
                                        sx={{
                                            position: "absolute", left: 0, right: 0, top: HALF,
                                            height: "1px",
                                            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.22),
                                        }}
                                    />
                                    {height > 0 && (
                                        <Box
                                            sx={{
                                                position: "absolute", left: 5, right: 5, height,
                                                borderRadius: 0.5,
                                                ...(above
                                                    ? { top: HALF + 1 }
                                                    : { bottom: HALF }),
                                                bgcolor: good ? INCOME_COLOR : "error.main",
                                                // The period still running is measured but
                                                // not yet a result, so it is drawn as an
                                                // outline rather than a solid verdict.
                                                ...(c.open
                                                    ? {
                                                        bgcolor: "transparent",
                                                        border: "1px solid",
                                                        borderColor: good ? INCOME_COLOR : "error.main",
                                                    }
                                                    : {}),
                                            }}
                                        />
                                    )}
                                    {c.quiet && (
                                        <Box
                                            sx={{
                                                position: "absolute", left: 5, right: 5,
                                                bottom: HALF, height: 2, borderRadius: 0.5,
                                                bgcolor: (theme) => alpha(theme.palette.text.primary, 0.18),
                                            }}
                                        />
                                    )}
                                </Box>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        display: "block", textAlign: "center", fontSize: 10,
                                        color: "text.disabled",
                                    }}
                                    noWrap
                                >
                                    {columnLabel(c.from, c.to)}
                                </Typography>
                            </Box>
                        </Tooltip>
                    );
                })}
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {judged === 0
                    ? "No closed periods to judge yet"
                    : `${passed} of ${judged} passed${streak > 1 ? ` · ${streak} in a row` : ""}`}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
                {direction === "floor"
                    ? "Above the line: past target. Below: short."
                    : "Below the line: under the limit. Above: over."}
            </Typography>
        </Box>
    );
}
