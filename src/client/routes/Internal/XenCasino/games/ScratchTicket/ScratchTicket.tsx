import { useState, useEffect } from "react";
import { Box, Button, Card, CardContent, Typography, TextField, Stack, Divider } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import { useScratchTicket } from "./useScratchTicket";
import OddsDisplay from "../../components/OddsDisplay";

// Cosmetic only - actual win/payout logic is entirely server-determined.
const BONUS_SYMBOLS = new Set(["2x", "5x", "10x", "20x"]);

export default function ScratchTicket() {
    const navigate = useNavigate();
    const [wagerInput, setWagerInput] = useState("5");
    // Two independent reveal zones per line: the 3 symbol boxes (do they match?) and the
    // separate prize box (what's it worth?) - scratching one says nothing about the other.
    const [scratchedSymbols, setScratchedSymbols] = useState<Set<number>>(new Set());
    const [scratchedPrizes, setScratchedPrizes] = useState<Set<number>>(new Set());
    const { odds, isPending, lastResult, buyTicket } = useScratchTicket();

    // A fresh ticket starts fully unscratched.
    useEffect(() => {
        setScratchedSymbols(new Set());
        setScratchedPrizes(new Set());
    }, [lastResult]);

    const wager = Number(wagerInput);
    const canPlay = !isPending && Number.isFinite(wager) && wager > 0;
    const lines = lastResult?.lines ?? [];
    const allScratched =
        lines.length > 0 && scratchedSymbols.size === lines.length && scratchedPrizes.size === lines.length;

    const scratchSymbols = (index: number) => {
        setScratchedSymbols((prev) => new Set(prev).add(index));
    };
    const scratchPrize = (index: number) => {
        setScratchedPrizes((prev) => new Set(prev).add(index));
    };
    const scratchAll = () => {
        setScratchedSymbols(new Set(lines.map((_, i) => i)));
        setScratchedPrizes(new Set(lines.map((_, i) => i)));
    };

    // Only counts once BOTH zones on a winning line are revealed - you need to scratch
    // the symbols (to know you won) and the prize box (to know how much) separately.
    const revealedTotal = lines.reduce(
        (sum, line, i) =>
            sum + (scratchedSymbols.has(i) && scratchedPrizes.has(i) && line.won ? line.prizeMultiplier * wager : 0),
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
                            10 lines. Match all 3 symbols to win — then scratch the prize box to see how much.
                            Reveal a rare 2x/5x/10x/20x bonus symbol and that line auto-wins at that multiple.
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
                            <Stack spacing={1} sx={{ maxWidth: 460, mx: "auto" }}>
                                {lines.map((line, i) => {
                                    const symbolsRevealed = scratchedSymbols.has(i);
                                    const prizeRevealed = scratchedPrizes.has(i);
                                    const won = symbolsRevealed && line.won;
                                    return (
                                        <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
                                            {line.symbols.map((symbol, j) => {
                                                const isBonus = symbolsRevealed && BONUS_SYMBOLS.has(symbol);
                                                return (
                                                    <Box
                                                        key={j}
                                                        onClick={() => !symbolsRevealed && scratchSymbols(i)}
                                                        sx={{
                                                            width: 40,
                                                            height: 40,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            fontSize: isBonus ? 14 : 22,
                                                            fontWeight: isBonus ? 800 : 400,
                                                            color: isBonus ? "warning.contrastText" : "inherit",
                                                            bgcolor: isBonus
                                                                ? "warning.main"
                                                                : symbolsRevealed
                                                                ? "action.hover"
                                                                : "action.selected",
                                                            borderRadius: 1,
                                                            cursor: symbolsRevealed ? "default" : "pointer",
                                                        }}
                                                    >
                                                        {symbolsRevealed ? symbol : "❔"}
                                                    </Box>
                                                );
                                            })}
                                            <Box
                                                onClick={() => !prizeRevealed && scratchPrize(i)}
                                                sx={{
                                                    width: 64,
                                                    height: 40,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    bgcolor: prizeRevealed ? "action.hover" : "warning.light",
                                                    borderRadius: 1,
                                                    cursor: prizeRevealed ? "default" : "pointer",
                                                }}
                                            >
                                                {prizeRevealed ? `${line.prizeMultiplier}x` : "🎁"}
                                            </Box>
                                            <Typography sx={{ width: 64, fontWeight: 700 }} color={line.bonusMultiple ? "warning.main" : "success.main"}>
                                                {symbolsRevealed && prizeRevealed && won
                                                    ? line.bonusMultiple
                                                        ? `BONUS ${line.bonusMultiple}x`
                                                        : "WIN"
                                                    : ""}
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
                                        setScratchedSymbols(new Set());
                                        setScratchedPrizes(new Set());
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
                <>
                    <OddsDisplay
                        title="Prizes"
                        rows={odds.linePrizes.map((prize, i) => ({
                            label: `Line ${i + 1}`,
                            probability: odds.matchProbability,
                            payout: `${prize}x`,
                        }))}
                        footnote={`P(at least one winning line): ${(odds.probabilityAtLeastOneWin * 100).toFixed(1)}% · RTP: ${(odds.rtp * 100).toFixed(1)}% (lower than Crash/Slots — that's authentic to real scratch tickets). The symbol you match doesn't change the prize — only whether you win it.`}
                    />
                    <OddsDisplay
                        title="Bonus Symbols"
                        rows={odds.bonusSymbols.map((b) => ({
                            label: `Reveal ${b.symbol} (any box)`,
                            probability: b.probability,
                            payout: `${b.multiple}x that line's prize`,
                        }))}
                        footnote={`Reveal any one of these in any box and that line auto-wins, no match needed. P(at least one bonus on a ticket): ${(odds.probabilityAtLeastOneBonus * 100).toFixed(2)}%.`}
                    />
                </>
            )}
        </Box>
    );
}
