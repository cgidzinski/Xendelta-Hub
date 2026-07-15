import { useState } from "react";
import { Box, Button, Dialog, IconButton, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import SlotMachine, { SlotSpinResult } from "../../components/SlotMachine";
import { formatOddsRatio } from "../../utils/odds";
import { formatCheddar } from "../../utils/currency";

// Everything Easy Spin needs lives in this one file - it only imports shared
// infrastructure (GameWrapper, SlotMachine, the odds/currency utils). A second
// low-denomination machine would be a new file shaped exactly like this one, hitting its
// own /api/casino/games/slots/<slug>/* routes.
const MACHINE = "easy-spin";

const SYMBOL_EMOJI: Record<string, string> = {
    cherry: "🍒",
    lemon: "🍋",
    bell: "🔔",
    diamond: "💎",
    seven: "7️⃣",
};
const DEFAULT_REELS = ["cherry", "cherry", "cherry"];
const BET_OPTIONS = [500, 1000, 2500, 5000, 10000];

interface SlotsOddsResponse {
    paytable: { combo: string; probability: number; multiplier?: number }[];
    jackpotContributionRate: number;
    jackpotPool: number;
    rtp: number;
}

const fetchOdds = async (): Promise<SlotsOddsResponse> =>
    (await apiClient.get<ApiResponse<SlotsOddsResponse>>(`/api/casino/games/slots/${MACHINE}/odds`)).data.data!;

const spinReels = async (wager: number): Promise<SlotSpinResult> =>
    (await apiClient.post<ApiResponse<SlotSpinResult>>(`/api/casino/games/slots/${MACHINE}/spin`, { wager })).data.data!;

export default function EasySpin() {
    const [playing, setPlaying] = useState(false);
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

    const { data: odds } = useQuery({ queryKey: ["slotsOdds", MACHINE], queryFn: fetchOdds, staleTime: 15 * 1000 });

    const { mutateAsync: spinAsync, isPending } = useMutation({
        mutationFn: spinReels,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
            queryClient.invalidateQueries({ queryKey: ["slotsOdds", MACHINE] });
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to spin", { variant: "error" }),
    });

    // Fired only once SlotMachine has finished revealing the reels, not the instant the
    // network response arrives.
    const handleResult = (result: SlotSpinResult) => {
        if (result.jackpot) {
            enqueueSnackbar(`JACKPOT! You won ${formatCheddar(result.payout)} cheddar!`, { variant: "success" });
        } else if (result.payout > 0) {
            enqueueSnackbar(`You won ${formatCheddar(result.payout)} cheddar!`, { variant: "success" });
        } else {
            enqueueSnackbar("No win this spin.", { variant: "info" });
        }
    };

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
            title="Easy Spin"
            oddsLabel={oddsLabel}
            howToPlay="A 500-credit machine. Spin the reels for a shot at the growing jackpot - match 3 symbols to win."
            oddsSections={oddsSections}
        >
            <Box sx={{ position: "relative", maxWidth: 480, mx: "auto" }}>
                <Box sx={{ opacity: 0.45, filter: "blur(1px)", pointerEvents: "none" }}>
                    <Box
                        sx={{
                            display: "flex",
                            gap: 1,
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: "#000",
                            border: "3px solid",
                            borderColor: "grey.800",
                        }}
                    >
                        {DEFAULT_REELS.map((symbol, i) => (
                            <Box
                                key={i}
                                sx={{
                                    flex: 1,
                                    height: 96,
                                    borderRadius: 1,
                                    bgcolor: "#0d0d0d",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 48,
                                }}
                            >
                                {SYMBOL_EMOJI[symbol]}
                            </Box>
                        ))}
                    </Box>
                </Box>
                <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Button
                        variant="contained"
                        color="warning"
                        size="large"
                        onClick={() => setPlaying(true)}
                        sx={{ borderRadius: 999, px: 5, py: 1.5, fontWeight: 800 }}
                    >
                        Start Playing
                    </Button>
                </Box>
            </Box>

            <Dialog fullScreen={fullScreen} maxWidth="md" fullWidth={!fullScreen} open={playing} onClose={() => setPlaying(false)}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", p: 1 }}>
                    <IconButton onClick={() => setPlaying(false)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Box sx={{ px: 3, pb: 4 }}>
                    <SlotMachine
                        symbols={SYMBOL_EMOJI}
                        betOptions={BET_OPTIONS}
                        jackpotPool={odds?.jackpotPool}
                        denominationLabel="500"
                        isPending={isPending}
                        spin={spinAsync}
                        onResult={handleResult}
                    />
                </Box>
            </Dialog>
        </GameWrapper>
    );
}
