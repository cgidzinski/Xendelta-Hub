import { Box, Tooltip, alpha } from "@mui/material";

interface BudgetBarProps {
    spent: number;
    amount: number;
    /** Uncapped percentage from the server, so 130 really means 130. */
    percent: number;
    over: boolean;
    /** The fill colour while inside the limit. */
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
 * limit keeps the scope colour, and the excess is drawn past a hard rule at the limit.
 * Overspend is then visible as a position on the bar, not only as a colour - which is
 * also what keeps it readable for anyone who can't separate the two hues.
 */
export default function BudgetBar({
    spent, amount, percent, over, color, height = 8, pace, label,
}: BudgetBarProps) {
    // Over budget the track is scaled to `spent`, so the limit sits part-way along it;
    // inside the limit the track is the limit and the fill is the share used.
    const limitPct = over && spent > 0 ? (amount / spent) * 100 : 100;
    const fillPct = over ? 100 : Math.max(0, Math.min(percent, 100));
    const overflowPct = Math.max(0, 100 - limitPct);
    // Only drawn while inside the limit, where the track still spans exactly the limit -
    // so the tick sits at the same fraction the fill is measured in. Past the limit the
    // question it answers ("will this last the period?") has already been settled.
    const pacePct = pace === undefined ? undefined : Math.min(100, Math.max(0, pace * 100));

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
                        bgcolor: "error.main",
                        flexShrink: 0,
                        // The rule reads as a hard edge at the limit rather than a colour
                        // change that could pass for a gradient.
                        borderLeft: "2px solid",
                        borderColor: "background.paper",
                    }}
                />
            )}
            {pacePct !== undefined && !over && (
                <Tooltip title="Even pace for this period">
                    <Box
                        sx={{
                            position: "absolute",
                            left: `${pacePct}%`,
                            top: 0,
                            bottom: 0,
                            width: "1px",
                            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.45),
                        }}
                    />
                </Tooltip>
            )}
        </Box>
    );
}
