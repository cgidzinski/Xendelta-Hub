import { Box, Stack, Typography, alpha } from "@mui/material";
import type { BudgetKind } from "../../../../../hooks/xenbudget/types";
import type { BudgetPace } from "./budgetPace";
import { aheadIsGood, limitColor, limitState, periodLabel } from "./budgetKind";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface PaceSummaryProps {
    kind: BudgetKind;
    /** Raw period value off the budget, e.g. "monthly" or "custom". */
    period: string;
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
    kind, period, pace, amount, spent, percent, money,
}: PaceSummaryProps) {
    const state = limitState(kind, percent, pace.elapsed);
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
                    {capitalize(periodLabel(period))} · day {pace.dayOf} of {pace.totalDays}
                </Typography>
                <Typography variant="caption" sx={{ color: stateColor ?? "text.secondary" }}>
                    {pace.finished
                        ? `Period ended · ${money(spent)} of ${money(amount)} ${kind === "goal" ? "saved" : "used"}`
                        : [
                            Math.abs(pace.ahead) < 0.01
                                ? "On pace"
                                : pace.ahead > 0
                                    ? `${money(pace.ahead)} ${aheadIsGood(kind) ? "ahead of pace" : "over pace"}`
                                    : `${money(-pace.ahead)} ${aheadIsGood(kind) ? "behind pace" : "under pace"}`,
                            spent > 0 ? `${money(pace.projected)} projected` : null,
                        ].filter(Boolean).join(" · ")}
                </Typography>
            </Stack>
        </Box>
    );
}
