import { useState, useEffect } from "react";
import { Box, Button, Card, CardContent, Typography, TextField, Stack, Divider } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import { useScratchTicket } from "./useScratchTicket";
import OddsDisplay from "../../components/OddsDisplay";

export default function ScratchTicket() {
    const navigate = useNavigate();
    const [wagerInput, setWagerInput] = useState("5");
    const [scratchedLines, setScratchedLines] = useState<Set<number>>(new Set());
    const { odds, isPending, lastResult, buyTicket } = useScratchTicket();

    // A fresh ticket starts fully unscratched.
    useEffect(() => {
        setScratchedLines(new Set());
    }, [lastResult]);

    const wager = Number(wagerInput);
    const canPlay = !isPending && Number.isFinite(wager) && wager > 0;
    const lines = lastResult?.lines ?? [];
    const allScratched = lines.length > 0 && scratchedLines.size === lines.length;

    const scratchLine = (index: number) => {
        setScratchedLines((prev) => new Set(prev).add(index));
    };
    const scratchAll = () => {
        setScratchedLines(new Set(lines.map((_, i) => i)));
    };

    const revealedTotal = lines.reduce(
        (sum, line, i) => sum + (scratchedLines.has(i) && line.won ? line.prizeMultiplier * wager : 0),
        0
    );

    return (
        <Box>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/internal/xencasino")} sx={{ mb: 2 }}>
                Back to Games
            </Button>
            <Card variant="outlined">
                <CardContent sx={{ py: 4 }}>
                    <Box sx={{ textAlign: "center", mb: 3 }}>
                        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                            Scratch Ticket
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            10 lines, 3 hidden symbols each. Match all 3 to win — the symbol you match is the prize.
                        </Typography>
                    </Box>

                    {lines.length === 0 ? (
                        <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" sx={{ py: 4 }}>
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
                    ) : (
                        <>
                            <Stack spacing={1} sx={{ maxWidth: 420, mx: "auto" }}>
                                {lines.map((line, i) => {
                                    const revealed = scratchedLines.has(i);
                                    return (
                                        <Stack
                                            key={i}
                                            direction="row"
                                            spacing={1}
                                            alignItems="center"
                                            sx={{ py: 0.5 }}
                                        >
                                            <Box sx={{ width: 56 }}>
                                                <Typography sx={{ fontWeight: 600, lineHeight: 1.1 }} color={revealed && line.won ? "success.main" : "text.secondary"}>
                                                    {revealed ? (line.won ? `${line.prizeMultiplier}x` : "—") : "?"}
                                                </Typography>
                                            </Box>
                                            {line.symbols.map((symbol, j) => (
                                                <Box
                                                    key={j}
                                                    onClick={() => !revealed && scratchLine(i)}
                                                    sx={{
                                                        width: 44,
                                                        height: 44,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        fontSize: 24,
                                                        bgcolor: revealed ? "action.hover" : "action.selected",
                                                        borderRadius: 1,
                                                        cursor: revealed ? "default" : "pointer",
                                                    }}
                                                >
                                                    {revealed ? symbol : "❔"}
                                                </Box>
                                            ))}
                                            <Typography sx={{ width: 48, fontWeight: 700 }} color="success.main">
                                                {revealed && line.won ? "WIN" : ""}
                                            </Typography>
                                        </Stack>
                                    );
                                })}
                            </Stack>

                            <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 3 }}>
                                <Button variant="outlined" onClick={scratchAll} disabled={allScratched}>
                                    Scratch All
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => {
                                        setScratchedLines(new Set());
                                        buyTicket(wager);
                                    }}
                                    disabled={isPending}
                                >
                                    New Ticket
                                </Button>
                            </Stack>

                            <Divider sx={{ my: 3 }} />
                            <Typography variant="h6" sx={{ textAlign: "center" }} color={revealedTotal > 0 ? "success.main" : "text.secondary"}>
                                {allScratched
                                    ? `Ticket complete — won ${revealedTotal.toFixed(2)} cheddar`
                                    : `Revealed so far: ${revealedTotal.toFixed(2)} cheddar`}
                            </Typography>
                        </>
                    )}
                </CardContent>
            </Card>

            {odds && (
                <OddsDisplay
                    title="Symbol Prizes"
                    rows={odds.symbols.map((s) => ({
                        label: `Match 3 ${s.symbol}`,
                        probability: s.probability,
                        payout: `${s.prizeMultiplier}x`,
                    }))}
                    footnote={`P(at least one winning line): ${(odds.probabilityAtLeastOneWin * 100).toFixed(1)}% · RTP: ${(odds.rtp * 100).toFixed(1)}% (lower than Crash/Slots — that's authentic to real scratch tickets).`}
                />
            )}
        </Box>
    );
}
