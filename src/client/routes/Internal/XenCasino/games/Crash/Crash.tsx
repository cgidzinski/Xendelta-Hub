import { useState } from "react";
import { Box, Button, Card, CardContent, Typography, TextField, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import { useCrash } from "./useCrash";
import OddsDisplay from "../../components/OddsDisplay";

export default function Crash() {
    const navigate = useNavigate();
    const [wagerInput, setWagerInput] = useState("5");
    const { odds, isPlaying, liveMultiplier, lastResult, isStarting, isCashingOut, start, cashOut } = useCrash();

    const wager = Number(wagerInput);
    const canStart = !isPlaying && !isStarting && Number.isFinite(wager) && wager > 0;

    return (
        <Box>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/internal/xencasino")} sx={{ mb: 2 }}>
                Back to Games
            </Button>
            <Card variant="outlined">
                <CardContent sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                        Crash
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Cash out before it crashes. The longer you wait, the higher the multiplier — and the risk.
                    </Typography>

                    <Typography
                        variant="h2"
                        sx={{ fontWeight: 700, color: isPlaying ? "warning.main" : "text.primary", mb: 3 }}
                    >
                        {liveMultiplier.toFixed(2)}x
                    </Typography>

                    {!isPlaying ? (
                        <Stack direction="row" spacing={2} justifyContent="center" alignItems="center">
                            <TextField
                                label="Wager"
                                type="number"
                                size="small"
                                value={wagerInput}
                                onChange={(e) => setWagerInput(e.target.value)}
                                sx={{ width: 120 }}
                            />
                            <Button variant="contained" color="primary" size="large" disabled={!canStart} onClick={() => start(wager)}>
                                Start Round
                            </Button>
                        </Stack>
                    ) : (
                        <Button variant="contained" color="error" size="large" disabled={isCashingOut} onClick={cashOut}>
                            Cash Out
                        </Button>
                    )}

                    {lastResult && (
                        <Typography sx={{ mt: 3 }} color={lastResult.won ? "success.main" : "error.main"}>
                            {lastResult.won
                                ? `You cashed out at ${lastResult.multiplier.toFixed(2)}x`
                                : `Crashed at ${lastResult.crashPoint.toFixed(2)}x`}
                        </Typography>
                    )}
                </CardContent>
            </Card>

            {odds && (
                <OddsDisplay
                    title="Odds"
                    rows={odds.referenceOdds.map((o) => ({
                        label: `Reach ${o.multiplier}x`,
                        probability: o.probability,
                    }))}
                    footnote={`House edge: ${(odds.houseEdge * 100).toFixed(1)}% — your expected return is the same no matter when you cash out.`}
                />
            )}
        </Box>
    );
}
