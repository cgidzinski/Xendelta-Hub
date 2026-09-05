import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { formatCurrency } from "../../currency";
import BudgetBar from "./BudgetBar";
import {
    NO_ACTIVITY_CAPTION, limitCaption, limitColor, limitState, settledCaption,
    type BudgetVerdict, type LimitDirection,
} from "./budgetKind";

interface BudgetLimitLineProps {
    /** Who or what this limit is for - chips, an avatar, or an "Everyone" pill. */
    label: ReactNode;
    amount: number;
    spent: number;
    percent: number;
    over: boolean;
    direction: LimitDirection;
    currency: string;
    color: string;
    height?: number;
    pace?: number;
    /**
     * The window's result, once it has closed. Passing it switches the whole line into the
     * past tense - a settled bar, and a caption saying what happened rather than what is
     * left. Absent (or `open`) keeps the live treatment.
     */
    verdict?: BudgetVerdict;
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
    label, amount, spent, percent, over, direction, currency, color, height = 8, pace,
    verdict, itemCount, barLabel,
}: BudgetLimitLineProps) {
    const money = (v: number) => formatCurrency(v, currency);
    const remaining = amount - spent;
    const settled = verdict !== undefined && verdict.key !== "open";
    // Two vocabularies, one line. While the window runs the caption is measured against
    // pace ("$180 left"); once it closes that question is settled and the verdict answers
    // a different one ("Closed $180 under").
    const state = limitState(direction, percent, pace);
    const captionColor = settled ? verdict.color : limitColor(state);
    const failed = settled ? verdict.key === "miss" : state === "over";

    return (
        <Box>
            <Stack
                direction="row" alignItems="center" spacing={1}
                sx={{ mb: 0.5, minWidth: 0 }}
            >
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>{label}</Box>
                <Typography
                    variant="body2" noWrap
                    sx={{ flexShrink: 0, color: failed ? "error.main" : "text.primary" }}
                >
                    {money(spent)}
                    <Typography component="span" variant="body2" color="text.secondary">
                        {" / "}{money(amount)}
                    </Typography>
                </Typography>
            </Stack>
            <BudgetBar
                spent={spent} amount={amount} percent={percent} over={over} direction={direction}
                color={color} height={height} pace={pace} settled={settled} label={barLabel}
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
                    sx={{ flexGrow: 1, textAlign: "right", color: captionColor ?? "text.secondary" }}
                >
                    {settled && verdict.key === "quiet"
                        ? NO_ACTIVITY_CAPTION
                        : settled
                            ? settledCaption(direction, remaining, percent, money)
                            : limitCaption(direction, remaining, percent, money)}
                </Typography>
            </Stack>
        </Box>
    );
}
