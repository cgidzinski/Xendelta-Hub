import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Typography, Chip, Avatar, ButtonBase } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../config/api";
import { ApiResponse } from "../../../types/api";
import { CASINO_GAMES_REGISTRY, CasinoGameRegistryItem } from "./gamesRegistry";
import { formatOddsRatio } from "./utils/odds";
import { formatCheddar } from "./utils/currency";
import DailyQuestCard from "./components/DailyQuestCard";
import { useCasinoStatus } from "../../../hooks/casino/useCasinoStatus";
import { useCasinoGarden } from "../../../hooks/casino/useCasinoGarden";
import { useCasinoPrinter } from "../../../hooks/casino/useCasinoPrinter";
import { useCasinoRanch } from "../../../hooks/casino/useCasinoRanch";
import { useCasinoMine } from "../../../hooks/casino/useCasinoMine";
import { cardSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";

interface SlotsOddsSummary {
    paytable: { probability: number }[];
    jackpotPool: number;
    rtp: number;
}
interface KittyScratchOddsSummary {
    rowCount: number;
    rowDistribution: { value: number; probability: number }[];
    rtp: number;
}
interface CrosswordOddsSummary {
    distribution: { payout: number; probability: number }[];
    rtp: number;
}
// No paytable on either of these (unlike Slots/Kitty Scratch/Crossword) - the outcome comes
// from a real physics simulation driven by the player's own aim (drop position for Plinko,
// launch power for Pachinko), not a pre-selected weighted draw, so there's no fixed
// probability table to summarize into an odds ratio. Plinko does have a real `rtp` now (a
// Monte Carlo-derived worst-case figure - see the comment above MULTIPLIERS in
// plinkoLayout.ts); Pachinko's is still the deliberate later pass this comment used to flag
// for both of them.
interface PlinkoOddsSummary {
    rtp: number;
}
interface PachinkoOddsSummary {
    jackpotPool: number;
}
interface MemoryOddsSummary {
    distribution: { multiplier: number; probability: number }[];
    rtp: number;
}

// Same GET requests (and query keys) each game's own page uses to fetch its odds, so the
// cache is shared and warm either way - just enough of the response shape to compute one
// headline ratio per card. Every game/ticket is its own file/route now, so each has its own
// fetch here too - no shared "scratch" odds shape to genericize over.
const fetchSlotsOdds = async (machine: string): Promise<SlotsOddsSummary> =>
    (await apiClient.get<ApiResponse<SlotsOddsSummary>>(`/api/casino/games/slots/${machine}/odds`)).data.data!;
const fetchKittyScratchOdds = async (): Promise<KittyScratchOddsSummary> =>
    (await apiClient.get<ApiResponse<KittyScratchOddsSummary>>(`/api/casino/games/kitty-scratch/odds`)).data.data!;
const fetchCrosswordOdds = async (): Promise<CrosswordOddsSummary> =>
    (await apiClient.get<ApiResponse<CrosswordOddsSummary>>(`/api/casino/games/crossword/odds`)).data.data!;
const fetchPlinkoOdds = async (): Promise<PlinkoOddsSummary> =>
    (await apiClient.get<ApiResponse<PlinkoOddsSummary>>(`/api/casino/games/plinko/odds`)).data.data!;
const fetchPachinkoOdds = async (): Promise<PachinkoOddsSummary> =>
    (await apiClient.get<ApiResponse<PachinkoOddsSummary>>(`/api/casino/games/pachinko/odds`)).data.data!;
const fetchSpinmaniaOdds = async (): Promise<SlotsOddsSummary> =>
    (await apiClient.get<ApiResponse<SlotsOddsSummary>>(`/api/casino/games/spinmania/odds`)).data.data!;
const fetchMemoryOdds = async (): Promise<MemoryOddsSummary> =>
    (await apiClient.get<ApiResponse<MemoryOddsSummary>>(`/api/casino/games/memory/odds`)).data.data!;

const ODDS_CHIP_SX = {
    alignSelf: "flex-start",
    color: "info.main",
    bgcolor: "rgba(25, 118, 210, 0.12)",
    border: "1px solid rgba(25, 118, 210, 0.3)",
    fontWeight: 700,
} as const;

const RTP_CHIP_SX = {
    alignSelf: "flex-start",
    color: "secondary.main",
    bgcolor: "rgba(156, 39, 176, 0.12)",
    border: "1px solid rgba(156, 39, 176, 0.3)",
    fontWeight: 700,
} as const;

// Distinct from the odds/RTP chips - gold and a little louder, since the point is to catch
// the eye and make the pool feel like it's actually growing while you browse.
const JACKPOT_CHIP_SX = {
    alignSelf: "flex-start",
    color: "#000",
    bgcolor: "warning.main",
    border: "1px solid rgba(255, 193, 7, 0.6)",
    fontWeight: 800,
} as const;

type ChipColor = "default" | "success" | "warning" | "error" | "primary" | "info";
interface StatusChip {
    label: string;
    color: ChipColor;
}

// Fallback shown in the icon avatar on the rare chance a game's image fails to load -
// MUI's Avatar swaps to these children automatically on an img error.
function getInitials(label: string): string {
    const words = label.split(" ").filter(Boolean);
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
}

export default function GamesIndex() {
    const navigate = useNavigate();
    const { disabledGames } = useCasinoStatus();
    const { squares: gardenSquares } = useCasinoGarden();
    const { run: printerRun } = useCasinoPrinter();
    const { creatures: ranchCreatures, feedCooldownMs: ranchFeedCooldownMs } = useCasinoRanch();
    const { state: mineState } = useCasinoMine();

    const { data: easySpinOdds } = useQuery({
        queryKey: ["slotsOdds", "easy-spin"],
        queryFn: () => fetchSlotsOdds("easy-spin"),
        staleTime: 15 * 1000,
        refetchInterval: 15 * 1000, // keeps the jackpot chip below ticking up while browsing
    });
    const { data: spinmaniaOdds } = useQuery({
        queryKey: ["spinmaniaOdds"],
        queryFn: fetchSpinmaniaOdds,
        staleTime: 15 * 1000,
        refetchInterval: 15 * 1000,
    });
    const { data: kittyScratchOdds } = useQuery({
        queryKey: ["kittyScratchOdds"],
        queryFn: fetchKittyScratchOdds,
        staleTime: 5 * 60 * 1000,
    });
    const { data: crosswordOdds } = useQuery({
        queryKey: ["crosswordOdds"],
        queryFn: fetchCrosswordOdds,
        staleTime: 5 * 60 * 1000,
    });
    const { data: plinkoOdds } = useQuery({
        queryKey: ["plinkoOdds"],
        queryFn: fetchPlinkoOdds,
        staleTime: 5 * 60 * 1000,
    });
    const { data: pachinkoOdds } = useQuery({
        queryKey: ["pachinkoOdds"],
        queryFn: fetchPachinkoOdds,
        staleTime: 15 * 1000,
        refetchInterval: 15 * 1000, // keeps the jackpot chip ticking up while browsing, same as the slot machines
    });
    const { data: memoryOdds } = useQuery({
        queryKey: ["memoryOdds"],
        queryFn: fetchMemoryOdds,
        staleTime: 5 * 60 * 1000,
    });

    const oddsLabelByKey: Record<string, string | undefined> = {
        "easy-spin": formatOddsRatio(easySpinOdds?.paytable.reduce((sum, row) => sum + row.probability, 0)),
        spinmania: formatOddsRatio(spinmaniaOdds?.paytable.reduce((sum, row) => sum + row.probability, 0)),
        "kitty-scratch": formatOddsRatio(
            kittyScratchOdds
                ? 1 - Math.pow(kittyScratchOdds.rowDistribution.find((d) => d.value === 0)?.probability ?? 0, kittyScratchOdds.rowCount)
                : undefined
        ),
        crossword: formatOddsRatio(crosswordOdds?.distribution.filter((d) => d.payout > 0).reduce((sum, d) => sum + d.probability, 0)),
        memory: formatOddsRatio(memoryOdds?.distribution.filter((d) => d.multiplier > 0).reduce((sum, d) => sum + d.probability, 0)),
        // plinko has an RTP (below) but no per-slot probability table to turn into a "1:X"
        // odds ratio the way the weighted-draw games do; pachinko still has neither.
    };

    const rtpByKey: Record<string, number | undefined> = {
        "easy-spin": easySpinOdds?.rtp,
        spinmania: spinmaniaOdds?.rtp,
        "kitty-scratch": kittyScratchOdds?.rtp,
        crossword: crosswordOdds?.rtp,
        plinko: plinkoOdds?.rtp,
        memory: memoryOdds?.rtp,
        // pachinko intentionally omitted - RTP tuning is still a deliberate later pass for it.
    };
    const rtpLabelByKey: Record<string, string | undefined> = Object.fromEntries(
        Object.entries(rtpByKey).map(([key, rtp]) => [key, rtp !== undefined ? `RTP ${(rtp * 100).toFixed(1)}%` : undefined])
    );

    const jackpotAmountByKey: Record<string, string | undefined> = {
        "easy-spin": easySpinOdds ? formatCheddar(easySpinOdds.jackpotPool) : undefined,
        spinmania: spinmaniaOdds ? formatCheddar(spinmaniaOdds.jackpotPool) : undefined,
        pachinko: pachinkoOdds ? formatCheddar(pachinkoOdds.jackpotPool) : undefined,
    };

    // The persistent games (Garden/Printer/Mine) have no odds/RTP table to summarize the way
    // the instant-resolution games do - instead their cards show a live glance at the
    // player's own state, so there's a reason to check the games list rather than always
    // clicking straight in. Keyed by game.key, same as oddsLabelByKey/rtpLabelByKey above.
    const gardenEmpty = gardenSquares.filter((s) => s.status === "empty").length;
    const ranchHungry = ranchCreatures.filter((c) => {
        if (!c.lastFedAt) {
            return true;
        }
        return Date.now() - new Date(c.lastFedAt).getTime() >= ranchFeedCooldownMs;
    }).length;
    const mineDigsLeft = mineState ? Math.max(0, mineState.dailyDigCap - mineState.actionsToday) : 0;

    const statusChipsByKey: Record<string, StatusChip[]> = {
        printer: printerRun
            ? [
                printerRun.raided
                    ? { label: "Rig Raided", color: "error" as ChipColor }
                    : { label: `Print Run ${printerRun.currentMultiplier.toFixed(2)}x`, color: "warning" as ChipColor },
                ...(printerRun.raided ? [] : [{ label: `${printerRun.raidRiskPercent}% Raid Risk`, color: "error" as ChipColor }]),
            ]
            : [{ label: "No Print Run Active", color: "default" as ChipColor }],
        // Three things worth checking the ranch for - hungry animals (they decay if
        // neglected), empty plots (an earning opportunity going unused), and digs still
        // available today. Each chip only shows up when it's actually true.
        "cheddar-ranch": [
            ...(ranchHungry > 0 ? [{ label: `${ranchHungry} Hungry Animal${ranchHungry === 1 ? "" : "s"}`, color: "warning" as ChipColor }] : []),
            ...(gardenEmpty > 0 ? [{ label: `${gardenEmpty} Empty Plot${gardenEmpty === 1 ? "" : "s"}`, color: "default" as ChipColor }] : []),
            ...(mineState && mineDigsLeft > 0 ? [{ label: `${mineDigsLeft} Dig${mineDigsLeft === 1 ? "" : "s"} Left`, color: "default" as ChipColor }] : []),
        ],
    };

    const dailyGames = CASINO_GAMES_REGISTRY.filter((g) => g.dailyGame);
    const casinoGames = CASINO_GAMES_REGISTRY.filter((g) => !g.dailyGame);

    function renderGameRow(game: CasinoGameRegistryItem, isLast: boolean, showPrice: boolean) {
        const oddsLabel = oddsLabelByKey[game.key];
        const rtpLabel = rtpLabelByKey[game.key];
        const jackpotAmount = jackpotAmountByKey[game.key];
        const statusChips = statusChipsByKey[game.key];
        const disabled = disabledGames.includes(game.key);

        return (
            <ButtonBase
                key={game.key}
                focusRipple
                disabled={disabled}
                onClick={() => navigate(game.path)}
                sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.5,
                    p: 1.5,
                    textAlign: "left",
                    borderBottom: isLast ? "none" : "1px solid",
                    borderColor: "divider",
                    opacity: disabled ? 0.5 : 1,
                    "&:hover": disabled ? undefined : { bgcolor: "action.hover" },
                }}
            >
                <Avatar src={game.icon} variant="rounded" sx={{ width: 40, height: 40, borderRadius: 1.5, flexShrink: 0 }}>
                    {getInitials(game.label)}
                </Avatar>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="body2" component="h2" sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
                            {game.label}
                        </Typography>
                        {showPrice && (
                            <Typography variant="body2" sx={{ fontSize: "0.78rem", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                                <Typography component="span" variant="body2" color="error.main" sx={{ fontWeight: 700, fontSize: "inherit", fontVariantNumeric: "tabular-nums" }}>
                                    {formatCheddar(game.price)}
                                    {game.priceFrom ? "+" : ""}
                                </Typography>
                                <Typography component="span" variant="body2" color="text.disabled" sx={{ fontSize: "inherit" }}>
                                    {" "}
                                    / play
                                </Typography>
                            </Typography>
                        )}
                    </Box>

                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                            fontSize: "0.78rem",
                            lineHeight: 1.4,
                            mt: 0.25,
                            mb: 0.75,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                        }}
                    >
                        {game.description}
                    </Typography>

                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {disabled && <Chip label="Unavailable" size="small" color="default" sx={{ fontWeight: 700 }} />}
                        {!disabled && jackpotAmount !== undefined && (
                            <Chip label={`Jackpot: ${jackpotAmount}`} size="small" sx={JACKPOT_CHIP_SX} />
                        )}
                        {statusChips
                            ? statusChips.map((chip, idx) => (
                                  <Chip key={idx} label={chip.label} size="small" color={chip.color} sx={{ fontWeight: 700 }} />
                              ))
                            : (
                                <>
                                    {oddsLabel !== undefined && <Chip label={`Odds ${oddsLabel}`} size="small" sx={ODDS_CHIP_SX} />}
                                    {rtpLabel !== undefined && <Chip label={rtpLabel} size="small" sx={RTP_CHIP_SX} />}
                                </>
                            )}
                    </Box>
                </Box>
            </ButtonBase>
        );
    }

    function renderGroup(title: string, games: CasinoGameRegistryItem[], showPrice: boolean): ReactNode {
        if (games.length === 0) {
            return null;
        }
        return (
            <Box sx={{ mb: 4 }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1 }}>
                    <Typography sx={sectionLabelSx}>{title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {games.length}
                    </Typography>
                </Box>
                <Box sx={{ ...cardSx, overflow: "hidden" }}>
                    {games.map((game, i) => renderGameRow(game, i === games.length - 1, showPrice))}
                </Box>
            </Box>
        );
    }

    return (
        <Box>
            <DailyQuestCard sx={{ mb: 3 }} />
            {renderGroup("Daily Games", dailyGames, false)}
            {renderGroup("Casino Games", casinoGames, true)}
        </Box>
    );
}
