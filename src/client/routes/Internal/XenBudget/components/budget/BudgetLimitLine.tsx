import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import type { BudgetKind } from "../../../../../hooks/xenbudget/types";
import { formatCurrency } from "../../currency";
import BudgetBar from "./BudgetBar";
import { limitCaption, limitColor, limitState } from "./budgetKind";

interface BudgetLimitLineProps {
    /** Who or what this limit is for - chips, an avatar, or an "Everyone" pill. */
    label: ReactNode;
    amount: number;
    spent: number;
    percent: number;
    over: boolean;
    kind: BudgetKind;
    currency: string;
    color: string;
    height?: number;
    pace?: number;
    /** Item count shown at the left of the caption, e.g. "12 items". */
    itemCount?: number;
    /** Screen-reader description of the bar. */
    barLabel: string;
}

/**
 * One limit: who it's for, the figures, the bar, and the sentence underneath.
 *
 * The caption carries the state in words as well as colour ("$60 over", "$180 to go")
 * so the bar never has to be the only thing saying it - and so the two directions are
 * told apart by more than a hue.
 */
export default function BudgetLimitLine({
    label, amount, spent, percent, over, kind, currency, color, height = 8, pace, itemCount, barLabel,
}: BudgetLimitLineProps) {
    const money = (v: number) => formatCurrency(v, currency);
    const remaining = amount - spent;
    const state = limitState(kind, percent, pace);
    const stateColor = limitColor(state);

    return (
        <Box>
            <Stack
                direction="row" alignItems="center" spacing={1}
                sx={{ mb: 0.5, minWidth: 0 }}
            >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>{label}</Box>
                <Typography
                    variant="body2" noWrap
                    sx={{ flexShrink: 0, color: state === "over" ? "error.main" : "text.primary" }}
                >
                    {money(spent)}
                    <Typography component="span" variant="body2" color="text.secondary">
                        {" / "}{money(amount)}
                    </Typography>
                </Typography>
            </Stack>
            <BudgetBar
                spent={spent} amount={amount} percent={percent} over={over} kind={kind}
                color={color} height={height} pace={pace} label={barLabel}
            />
            <Stack direction="row" alignItems="center" sx={{ mt: 0.375, minWidth: 0 }}>
                {itemCount !== undefined && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                    </Typography>
                )}
                <Typography
                    variant="caption"
                    noWrap
                    sx={{ flexGrow: 1, textAlign: "right", color: stateColor ?? "text.secondary" }}
                >
                    {limitCaption(kind, remaining, percent, money)}
                </Typography>
            </Stack>
        </Box>
    );
}
