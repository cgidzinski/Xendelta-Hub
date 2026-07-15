import { useState } from "react";
import { Box, Button } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import ScratchCard, { ScratchPlayResult } from "../../components/ScratchCard";
import { formatOddsRatio } from "../../utils/odds";
import { formatCheddar } from "../../utils/currency";

// Everything Scratchmania needs lives in this one file - same shape as EasyScratch.tsx,
// just its own ticket slug/price and a genuinely different, higher-volatility paytable
// server-side (see scratchTicket.ts): rarer matches, rarer but much bigger bonus symbols,
// a bigger prize table.
const TICKET = "scratchmania";

interface ScratchOddsResponse {
    price: number;
    linePrizes: number[];
    matchProbability: number;
    bonusSymbols: { symbol: string; multiple: number; probability: number }[];
    probabilityAtLeastOneBonus: number;
    probabilityAtLeastOneWin: number;
    rtp: number;
}

const fetchOdds = async (): Promise<ScratchOddsResponse> =>
    (await apiClient.get<ApiResponse<ScratchOddsResponse>>(`/api/casino/games/scratch/${TICKET}/odds`)).data.data!;

const buyTicket = async (): Promise<ScratchPlayResult> =>
    (await apiClient.post<ApiResponse<ScratchPlayResult>>(`/api/casino/games/scratch/${TICKET}/play`, {})).data.data!;

export default function Scratchmania() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const [result, setResult] = useState<ScratchPlayResult | null>(null);
    const [checked, setChecked] = useState(false);

    const { data: odds } = useQuery({ queryKey: ["scratchOdds", TICKET], queryFn: fetchOdds, staleTime: 5 * 60 * 1000 });

    const { mutate: buy, isPending } = useMutation({
        mutationFn: buyTicket,
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
            setResult(res);
            setChecked(false);
            if (res.totalPayout > 0) {
                enqueueSnackbar(`You won ${formatCheddar(res.totalPayout)} cheddar!`, { variant: "success" });
            } else {
                enqueueSnackbar("No win this time.", { variant: "info" });
            }
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to buy ticket", { variant: "error" }),
    });

    const oddsLabel = formatOddsRatio(odds?.probabilityAtLeastOneWin);

    const oddsSections: OddsSection[] = odds
        ? [
              {
                  title: "Prizes",
                  rows: odds.linePrizes.map((prize, i) => ({
                      label: `Line ${i + 1}`,
                      probability: odds.matchProbability,
                      payout: `${prize}x`,
                  })),
                  footnote: `P(at least one winning line): ${(odds.probabilityAtLeastOneWin * 100).toFixed(1)}% · RTP: ${(odds.rtp * 100).toFixed(1)}%. Rarer wins than Easy Scratch, but a much bigger top prize.`,
              },
              {
                  title: "Bonus Symbols",
                  rows: odds.bonusSymbols.map((b) => ({
                      label: `Reveal ${b.symbol} (any box)`,
                      probability: b.probability,
                      payout: `${b.multiple}x that line's prize`,
                  })),
                  footnote: `Reveal any one of these in any box and that line auto-wins, no match needed. P(at least one bonus on a ticket): ${(odds.probabilityAtLeastOneBonus * 100).toFixed(2)}%.`,
              },
          ]
        : [];

    return (
        <GameWrapper
            title="Scratchmania"
            oddsLabel={oddsLabel}
            howToPlay="A 2000-cheddar high-roller ticket. Buy it, then scratch the foil to reveal 10 lines - match all 3 symbols to win, or reveal a rare 2x/5x/15x/50x bonus symbol for an instant win at that multiple. Rarer wins than Easy Scratch, but a much bigger top prize. Check Ticket instantly finishes the reveal."
            oddsSections={oddsSections}
        >
            <PlayLauncher
                preview={
                    <Box
                        sx={{
                            width: 440,
                            maxWidth: "100%",
                            height: 260,
                            mx: "auto",
                            borderRadius: 3,
                            border: "3px solid",
                            borderColor: "warning.main",
                            background: "linear-gradient(135deg, #9aa3ad 0%, #d7dbe0 50%, #9aa3ad 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 48,
                        }}
                    >
                        🎟️
                    </Box>
                }
                fullBleed
                headerActions={
                    result && !checked ? (
                        <Button variant="contained" color="warning" size="small" onClick={() => setChecked(true)} sx={{ fontWeight: 800 }}>
                            Check Ticket
                        </Button>
                    ) : null
                }
            >
                <ScratchCard price={odds?.price ?? 2000} isPending={isPending} result={result} checked={checked} onBuy={() => buy()} />
            </PlayLauncher>
        </GameWrapper>
    );
}
