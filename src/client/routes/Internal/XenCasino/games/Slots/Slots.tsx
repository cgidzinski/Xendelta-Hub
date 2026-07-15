import { useState } from "react";
import { Box, Button, Card, CardContent, Typography, TextField, Stack } from "@mui/material";
import { useSlots } from "./useSlots";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatOddsRatio } from "../../utils/odds";

const SYMBOL_EMOJI: Record<string, string> = {
    cherry: "🍒",
    lemon: "🍋",
    bell: "🔔",
    diamond: "💎",
    seven: "7️⃣",
};

const DEFAULT_REELS = ["cherry", "cherry", "cherry"];

export default function Slots() {
    const [wagerInput, setWagerInput] = useState("5");
    const { odds, isPending, lastResult, spin } = useSlots();

    const wager = Number(wagerInput);
    const canSpin = !isPending && Number.isFinite(wager) && wager > 0;

    const oddsLabel = formatOddsRatio(odds?.paytable.reduce((sum, row) => sum + row.probability, 0));

    const oddsSections: OddsSection[] = odds
        ? [
              {
                  title: "Paytable",
                  rows: odds.paytable.map((row) => ({
                      label: row.combo,
                      probability: row.probability,
                      payout: row.multiplier ? `${row.multiplier}x` : "Jackpot pool",
                  })),
                  footnote: `Blended RTP: ${(odds.rtp * 100).toFixed(1)}% · ${(odds.jackpotContributionRate * 100).toFixed(1)}% of every wager feeds the jackpot.`,
              },
          ]
        : [];

    return (
        <GameWrapper
            title="Slots"
            oddsLabel={oddsLabel}
            howToPlay="Spin the reels for a shot at the growing jackpot. Match 3 symbols to win."
            oddsSections={oddsSections}
        >
            <Card variant="outlined">
                <CardContent sx={{ textAlign: "center", py: 6 }}>
                    {odds && (
                        <Typography variant="body2" color="warning.main" sx={{ fontWeight: 700, mb: 3 }}>
                            Jackpot: {odds.jackpotPool.toFixed(2)} cheddar
                        </Typography>
                    )}

                    <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 3 }}>
                        {(lastResult?.reels ?? DEFAULT_REELS).map((symbol, i) => (
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
                                {SYMBOL_EMOJI[symbol] ?? "❔"}
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
                        <Button variant="contained" color="primary" size="large" disabled={!canSpin} onClick={() => spin(wager)}>
                            Spin
                        </Button>
                    </Stack>

                    {lastResult && (
                        <Typography sx={{ mt: 3 }} color={lastResult.payout > 0 ? "success.main" : "text.secondary"}>
                            {lastResult.jackpot
                                ? `JACKPOT! +${lastResult.payout.toFixed(2)} cheddar`
                                : lastResult.payout > 0
                                ? `+${lastResult.payout.toFixed(2)} cheddar`
                                : "No win"}
                        </Typography>
                    )}
                </CardContent>
            </Card>
        </GameWrapper>
    );
}
