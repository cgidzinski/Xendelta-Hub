import { Box, Stack, Typography, alpha } from "@mui/material";
import type { BudgetPace } from "./budgetPace";
import { aheadIsGood, limitColor, limitState, periodLabel, type LimitDirection } from "./budgetKind";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface PaceSummaryProps {
    direction: LimitDirection;
    /** Raw period value off the budget, e.g. "monthly" or "custom". */
    period: string;
    /**
     * Overrides the period word when the figures have been restated for some other window
     * - a report range, say. Without it a year-scaled card would still claim "Monthly".
     */
    periodLabel?: string;
    /** The budget's own window name ("Q3 2026"), shown when the figures aren't restated. */
    windowLabel?: string;
    /** The budget's own per-period rate, e.g. "$3,000 / quarter". */
    rate?: string;
    /** The budget's own amount as a per-month figure, e.g. "$1,000". */
    monthly?: string;
    pace: BudgetPace;
    amount: number;
    spent: number;
    percent: number;
    money: (v: number) => string;
}

/**
 * The period and the pace, grouped as one glanceable box instead of a single run-on
 * caption. Which days this covers and whether the spend is ahead of an even pace are two
 * different questions - keeping them on their own lines lets each be read at a glance
 * rather than parsed out of a sentence.
 */
export default function PaceSummary({
    direction, period, periodLabel: labelOverride, windowLabel: window, rate, monthly,
    pace, amount, spent, percent, money,
}: PaceSummaryProps) {
    const state = limitState(direction, percent, pace.elapsed);
    const stateColor = limitColor(state);

    return (
        <Box
            sx={{
                border: "1px solid", borderColor: "divider", borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.text.primary, 0.03),
                px: 1.25, py: 0.875,
            }}
        >
            <Stack spacing={0.375}>
                <Typography variant="caption" color="text.secondary">
                    {`${labelOverride ?? window ?? capitalize(periodLabel(period))} · day ${pace.dayOf} of ${pace.totalDays}`}
                </Typography>
                <Typography variant="caption" sx={{ color: stateColor ?? "text.secondary" }}>
                    {pace.finished
                        ? `Period ended · ${money(spent)} of ${money(amount)} ${direction === "floor" ? "received" : "used"}`
                        : [
                            Math.abs(pace.ahead) < 0.01
                                ? "On pace"
                                : pace.ahead > 0
                                    ? `${money(pace.ahead)} ${aheadIsGood(direction) ? "ahead of pace" : "over pace"}`
                                    : `${money(-pace.ahead)} ${aheadIsGood(direction) ? "behind pace" : "under pace"}`,
                            spent > 0 ? `${money(pace.projected)} projected` : null,
                        ].filter(Boolean).join(" · ")}
                </Typography>
                {rate && (
                    <Typography variant="caption" color="text.secondary">
                        {rate}{monthly ? ` · ≈ ${monthly}/mo` : null}
                    </Typography>
                )}
            </Stack>
        </Box>
    );
}
