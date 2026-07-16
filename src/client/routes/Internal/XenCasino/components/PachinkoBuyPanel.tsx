import { useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton, CircularProgress } from "@mui/material";
import { formatCheddar } from "../utils/currency";

interface PachinkoBuyPanelProps {
    batchSizes: number[];
    pricePerBall: number;
    isPending: boolean;
    onBuy: (ballsTotal: number) => Promise<unknown>;
}

/**
 * Shown instead of the board whenever there's no active batch - Pachinko's equivalent of
 * Plinko's bet-size picker, just one step earlier since a batch has to be bought before any
 * ball can be launched. Purely presentational, same as PachinkoBoard: knows nothing about
 * the backend route, just hands the chosen ball count to `onBuy` and lets the parent page
 * swap this out for the board once a batch exists.
 */
export default function PachinkoBuyPanel({ batchSizes, pricePerBall, isPending, onBuy }: PachinkoBuyPanelProps) {
    const [ballsTotal, setBallsTotal] = useState(batchSizes[0] ?? 0);

    // batchSizes arrives async with the odds fetch - if the user's current selection isn't
    // in the list yet (still the 0 default) or the list changed, fall back to the first
    // available size rather than letting the toggle group render with nothing selected.
    const selected = batchSizes.includes(ballsTotal) ? ballsTotal : (batchSizes[0] ?? 0);

    const canBuy = !isPending && selected > 0;

    return (
        <Box sx={{ maxWidth: 420, mx: "auto", textAlign: "center", py: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
                Buy Balls
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {formatCheddar(pricePerBall)} per ball - pick a batch to start a session.
            </Typography>

            <ToggleButtonGroup
                exclusive
                value={selected}
                onChange={(_, value) => value !== null && setBallsTotal(value)}
                sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 1, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider", borderRadius: "4px !important" } }}
            >
                {batchSizes.map((size) => (
                    <ToggleButton key={size} value={size} disabled={isPending} sx={{ px: 2.5, py: 1.5, fontWeight: 700, textTransform: "none", flexDirection: "column" }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                            {size} balls
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {formatCheddar(size * pricePerBall)}
                        </Typography>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <Box sx={{ mt: 3 }}>
                <Button
                    variant="contained"
                    color="warning"
                    size="large"
                    onClick={() => onBuy(selected)}
                    disabled={!canBuy}
                    startIcon={isPending ? <CircularProgress size={18} color="inherit" /> : undefined}
                    sx={{ borderRadius: 999, px: 5, py: 1.25, fontWeight: 800 }}
                >
                    {isPending ? "Buying…" : `Buy ${selected} Balls (${formatCheddar(selected * pricePerBall)})`}
                </Button>
            </Box>
        </Box>
    );
}
