import { useState } from "react";
import { Box, Button, Card, CardContent, Typography, TextField, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import { useScratchTicket } from "./useScratchTicket";
import OddsDisplay from "../../components/OddsDisplay";

const DEFAULT_PANELS = ["❔", "❔", "❔"];

export default function ScratchTicket() {
    const navigate = useNavigate();
    const [wagerInput, setWagerInput] = useState("5");
    const { odds, isPending, lastResult, buyTicket } = useScratchTicket();

    const wager = Number(wagerInput);
    const canPlay = !isPending && Number.isFinite(wager) && wager > 0;

    return (
        <Box>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/internal/xencasino")} sx={{ mb: 2 }}>
                Back to Games
            </Button>
            <Card variant="outlined">
                <CardContent sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                        Scratch Ticket
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Match all three symbols to win. Top prize: 100x.
                    </Typography>

                    <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 3 }}>
                        {(lastResult?.reveal ?? DEFAULT_PANELS).map((symbol, i) => (
                            <Box
                                key={i}
                                sx={{
                                    width: 72,
                                    height: 72,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 40,
                                    bgcolor: "action.hover",
                                    borderRadius: 2,
                                }}
                            >
                                {symbol}
                            </Box>
                        ))}
                    </Stack>

                    <Stack direction="row" spacing={2} justifyContent="center" alignItems="center">
                        <TextField
                            label="Wager"
                            type="number"
                            size="small"
                            value={wagerInput}
                            onChange={(e) => setWagerInput(e.target.value)}
                            sx={{ width: 120 }}
                        />
                        <Button variant="contained" color="primary" size="large" disabled={!canPlay} onClick={() => buyTicket(wager)}>
                            Buy Ticket
                        </Button>
                    </Stack>

                    {lastResult && (
                        <Typography sx={{ mt: 3 }} color={lastResult.payout > 0 ? "success.main" : "text.secondary"}>
                            {lastResult.payout > 0 ? `${lastResult.tier} win — +${lastResult.payout.toFixed(2)} cheddar` : "No prize"}
                        </Typography>
                    )}
                </CardContent>
            </Card>

            {odds && (
                <OddsDisplay
                    title="Prize Tiers"
                    rows={odds.paytable.map((row) => ({
                        label: row.label,
                        probability: row.probability,
                        payout: `${row.multiplier}x`,
                    }))}
                    footnote={`RTP: ${(odds.rtp * 100).toFixed(1)}% (house edge ${(100 - odds.rtp * 100).toFixed(1)}%).`}
                />
            )}
        </Box>
    );
}
