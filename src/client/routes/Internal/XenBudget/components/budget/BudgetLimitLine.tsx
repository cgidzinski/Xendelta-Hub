import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { formatCurrency } from "../../../../../utils/currencyUtils";
import BudgetBar from "./BudgetBar";
import { NEAR_LIMIT_PERCENT } from "./sortBudgets";

interface BudgetLimitLineProps {
    /** Who or what this limit is for - chips, an avatar, or an "Everyone" pill. */
    label: ReactNode;
    amount: number;
    spent: number;
    percent: number;
    over: boolean;
    currency: string;
    color: string;
    height?: number;
    pace?: number;
    /** Appended to the caption, e.g. "monthly". */
    suffix?: string;
    /** Screen-reader description of the bar. */
    barLabel: string;
}

/**
 * One limit: who it's for, the figures, the bar, and the sentence underneath.
 *
 * The caption carries the state in words as well as colour ("$60 over", "$180 left")
 * so the bar never has to be the only thing saying it.
 */
export default function BudgetLimitLine({
    label, amount, spent, percent, over, currency, color, height = 8, pace, suffix, barLabel,
}: BudgetLimitLineProps) {
    const money = (v: number) => formatCurrency(v, currency);
    const remaining = amount - spent;
    const near = !over && percent >= NEAR_LIMIT_PERCENT;

    return (
        <Box>
            <Stack
                direction="row" alignItems="center" spacing={1}
                sx={{ mb: 0.5, minWidth: 0 }}
            >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>{label}</Box>
                <Typography
                    variant="body2" noWrap
                    sx={{ flexShrink: 0, color: over ? "error.main" : "text.primary" }}
                >
                    {money(spent)}
                    <Typography component="span" variant="body2" color="text.secondary">
                        {" / "}{money(amount)}
                    </Typography>
                </Typography>
            </Stack>
            <BudgetBar
                spent={spent} amount={amount} percent={percent} over={over}
                color={color} height={height} pace={pace} label={barLabel}
            />
            <Typography
                variant="caption"
                sx={{
                    display: "block", mt: 0.375,
                    color: over ? "error.main" : near ? "warning.main" : "text.secondary",
                }}
            >
                {over
                    ? `${money(-remaining)} over · ${percent}%`
                    : `${money(remaining)} left · ${percent}%`}
                {suffix ? ` · ${suffix}` : ""}
            </Typography>
        </Box>
    );
}
