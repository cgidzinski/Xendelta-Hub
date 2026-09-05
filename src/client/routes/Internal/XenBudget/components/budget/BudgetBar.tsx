import { Box, Tooltip, alpha } from "@mui/material";
import type { LimitDirection } from "./budgetKind";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";

interface BudgetBarProps {
    spent: number;
    amount: number;
    /** Uncapped percentage from the server, so 130 really means 130. */
    percent: number;
    over: boolean;
    /** Decides whether passing the amount is failure or success. */
    direction: LimitDirection;
    /** The fill colour while inside the amount. */
    color: string;
    height?: number;
    /**
     * Where an even spend would have reached by now, 0-1. Drawn as a hairline tick, so a
     * fill past it reads as "spending faster than this period allows" without a number.
     */
    pace?: number;
    label: string;
}

/**
 * A budget's progress.
 *
 * The important difference from a plain progress bar is what happens past 100%. Clamping
 * the fill makes a budget at 260% look exactly like one at 100%, so instead the track
 * switches meaning once it's exceeded: it spans the SPENT amount, the portion up to the
 * amount keeps the scope colour, and the excess is drawn past a hard rule. The excess is
 * then visible as a position on the bar, not only as a colour - which is also what keeps
 * it readable for anyone who can't separate the two hues.
 *
 * Which colour that excess takes is the only thing direction changes here: past a ceiling
 * is a failure, past a floor is the point of the exercise.
 */
export default function BudgetBar({
    spent, amount, percent, over, direction, color, height = 8, pace, label,
}: BudgetBarProps) {
    // Over budget the track is scaled to `spent`, so the limit sits part-way along it;
    // inside the limit the track is the limit and the fill is the share used.
    const limitPct = over && spent > 0 ? (amount / spent) * 100 : 100;
    const fillPct = over ? 100 : Math.max(0, Math.min(percent, 100));
    const overflowPct = Math.max(0, 100 - limitPct);
    // Only drawn while the track still spans exactly the amount, so the tick sits at the
    // same fraction the fill is measured in. Once a cap is passed the question it answers
    // ("will this last the period?") has been settled - and a floor that is already met has
    // no pace left to keep.
    const pacePct = pace === undefined ? undefined : Math.min(100, Math.max(0, pace * 100));
    const showPace = pacePct !== undefined && !over;

    return (
        <Box
            role="img"
            aria-label={label}
            sx={{
                position: "relative",
                display: "flex",
                height,
                borderRadius: 999,
                overflow: "hidden",
                bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
            }}
        >
            <Box sx={{ width: `${over ? limitPct : fillPct}%`, bgcolor: color, flexShrink: 0 }} />
            {over && (
                <Box
                    sx={{
                        width: `${overflowPct}%`,
                        bgcolor: direction === "floor" ? INCOME_COLOR : "error.main",
                        flexShrink: 0,
                        // The rule reads as a hard edge at the limit rather than a colour
                        // change that could pass for a gradient.
                        borderLeft: "2px solid",
                        borderColor: "background.paper",
                    }}
                />
            )}
            {showPace && (
                // The rule itself is 1px, which is nothing to aim a finger at. The tooltip
                // hangs off a transparent strip centred on it instead, so the marker is
                // actually reachable on a touch screen.
                <Tooltip title="Even pace for this period" enterTouchDelay={0}>
                    <Box
                        sx={{
                            position: "absolute",
                            left: `${pacePct}%`,
                            transform: "translateX(-50%)",
                            top: 0,
                            bottom: 0,
                            width: 14,
                            display: "flex",
                            justifyContent: "center",
                        }}
                    >
                        <Box
                            sx={{
                                width: "1px",
                                alignSelf: "stretch",
                                bgcolor: (theme) => alpha(theme.palette.text.primary, 0.45),
                            }}
                        />
                    </Box>
                </Tooltip>
            )}
        </Box>
    );
}
