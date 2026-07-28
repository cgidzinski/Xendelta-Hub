import { useEffect, useState } from "react";
import { Box, Button, Card, CardContent, LinearProgress, Typography } from "@mui/material";
import LocalBarIcon from "@mui/icons-material/LocalBar";
import GavelIcon from "@mui/icons-material/Gavel";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { useCasinoStill } from "../../../../../hooks/casino/useCasinoStill";

// Same "force a redraw between fetches" trick as Garden - the batch's real state (its
// multiplier/risk) is server-computed and refetched on the hook's own interval; this just
// keeps the two gauges visibly animating in between those refetches.
function useNow(intervalMs: number) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

export default function Still() {
    const {
        stillLevel,
        maxStillLevel,
        batch,
        ingredientCost,
        bribeCost,
        upgradeCost,
        isLoading,
        start,
        isStarting,
        bribe,
        isBribing,
        collect,
        isCollecting,
        upgrade,
        isUpgrading,
    } = useCasinoStill();
    const { enqueueSnackbar } = useSnackbar();
    useNow(2 * 1000);

    const handleStart = () => start().catch((e) => enqueueSnackbar(e.message || "Failed to start batch", { variant: "error" }));
    const handleBribe = () => bribe().catch((e) => enqueueSnackbar(e.message || "Failed to bribe", { variant: "error" }));
    const handleCollect = () =>
        collect()
            .then((r) =>
                enqueueSnackbar(
                    r.raided ? "Raided! The batch was seized - nothing collected." : `Collected ${formatCheddar(r.payout)} cheddar!`,
                    { variant: r.raided ? "error" : "success" }
                )
            )
            .catch((e) => enqueueSnackbar(e.message || "Failed to collect", { variant: "error" }));
    const handleUpgrade = () => upgrade().catch((e) => enqueueSnackbar(e.message || "Failed to upgrade", { variant: "error" }));

    const oddsSections: OddsSection[] = [
        {
            title: "Economics",
            rows: [
                { label: "Ingredients", payout: `${formatCheddar(ingredientCost)} per batch` },
                { label: "Bribe", payout: `${formatCheddar(bribeCost)} - resets raid risk` },
                { label: "Upgrade Still", payout: `${formatCheddar(upgradeCost)} - reaches peak faster (max level ${maxStillLevel})` },
            ],
            footnote: "Payout multiplier rises from 1x toward a peak the longer the batch runs, then plateaus. Raid risk rises the longer it's been since your last bribe and is checked periodically - if it hits, the batch is seized with no payout.",
        },
    ];

    return (
        <GameWrapper
            title="Bootleg Still"
            howToPlay="Buy ingredients to start one batch. The longer you let it run, the bigger the payout multiplier gets - up to a peak. But raid risk also climbs the longer it's been since your last bribe. Bribe to knock risk back down, or cash out before it gets seized."
            oddsSections={oddsSections}
        >
            {isLoading ? (
                <LinearProgress sx={{ mt: 4 }} />
            ) : (
                <Card variant="outlined" sx={{ mt: 3 }}>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", py: 4 }}>
                        <LocalBarIcon sx={{ fontSize: 56, color: "warning.main" }} />
                        <Typography variant="subtitle1" color="text.secondary">
                            Still Level {stillLevel} / {maxStillLevel}
                        </Typography>

                        {!batch && (
                            <Button variant="contained" color="warning" size="large" disabled={isStarting} onClick={handleStart} sx={{ fontWeight: 800, px: 4 }}>
                                Start Batch ({formatCheddar(ingredientCost)})
                            </Button>
                        )}

                        {batch && (
                            <Box sx={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 2 }}>
                                <Box>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                        <Typography variant="body2">Payout</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {batch.currentMultiplier.toFixed(2)}x ({formatCheddar(Math.round(batch.ingredientCost * batch.currentMultiplier))})
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(100, (batch.currentMultiplier / 4) * 100)}
                                        color="success"
                                        sx={{ height: 10, borderRadius: 999 }}
                                    />
                                </Box>

                                <Box>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                        <Typography variant="body2">Raid Risk</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {batch.raidRiskPercent}%
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={batch.raidRiskPercent}
                                        color="error"
                                        sx={{ height: 10, borderRadius: 999 }}
                                    />
                                </Box>

                                <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center", mt: 1 }}>
                                    <Button variant="outlined" color="error" startIcon={<GavelIcon />} disabled={isBribing} onClick={handleBribe}>
                                        Bribe ({formatCheddar(bribeCost)})
                                    </Button>
                                    <Button variant="contained" color="success" disabled={isCollecting} onClick={handleCollect}>
                                        Collect Now
                                    </Button>
                                </Box>
                            </Box>
                        )}

                        {!batch && stillLevel < maxStillLevel && (
                            <Button variant="text" disabled={isUpgrading} onClick={handleUpgrade} sx={{ mt: 1 }}>
                                Upgrade Still ({formatCheddar(upgradeCost)})
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
        </GameWrapper>
    );
}
