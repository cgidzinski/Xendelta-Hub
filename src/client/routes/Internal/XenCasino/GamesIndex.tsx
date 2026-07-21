import { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Card, CardActionArea, CardContent, Typography, Chip, Avatar, SvgIconProps } from "@mui/material";
import CasinoIcon from "@mui/icons-material/Casino";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import AdjustIcon from "@mui/icons-material/Adjust";
import GridViewIcon from "@mui/icons-material/GridView";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../config/api";
import { ApiResponse } from "../../../types/api";
import { CASINO_GAMES_REGISTRY, CASINO_GAME_TYPE_LABELS, CasinoGameType } from "./gamesRegistry";
import { formatOddsRatio } from "./utils/odds";
import { formatCheddar } from "./utils/currency";
import DailyQuestCard from "./components/DailyQuestCard";

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

const TYPE_ICON: Record<CasinoGameType, ComponentType<SvgIconProps>> = {
    slots: CasinoIcon,
    scratch: ConfirmationNumberIcon,
    plinko: ScatterPlotIcon,
    pachinko: AdjustIcon,
    memory: GridViewIcon,
};

const TYPE_ORDER: CasinoGameType[] = ["slots", "scratch", "plinko", "pachinko", "memory"];

const GHOST_COPY: Partial<Record<CasinoGameType, string>> = {
    slots: "New reel sets and jackpots land here as they ship.",
    scratch: "New ticket variants land here as they ship.",
};

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

export default function GamesIndex() {
    const navigate = useNavigate();

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
        // plinko has an RTP (below) but no per-slot probability table to turn into a "1 in N"
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

    const jackpotLabelByKey: Record<string, string | undefined> = {
        "easy-spin": easySpinOdds ? `🎰 ${formatCheddar(easySpinOdds.jackpotPool)}` : undefined,
        spinmania: spinmaniaOdds ? `🎰 ${formatCheddar(spinmaniaOdds.jackpotPool)}` : undefined,
        pachinko: pachinkoOdds ? `🎰 ${formatCheddar(pachinkoOdds.jackpotPool)}` : undefined,
    };

    const groups = TYPE_ORDER.map((type) => ({
        type,
        games: CASINO_GAMES_REGISTRY.filter((g) => g.type === type),
    })).filter((g) => g.games.length > 0);

    return (
        <Box>
            <DailyQuestCard sx={{ mb: 4 }} />

            {groups.map((group, i) => {
                const Icon = TYPE_ICON[group.type];
                const ghostCopy = GHOST_COPY[group.type];
                return (
                    <Box key={group.type} sx={{ mt: i === 0 ? 0 : 5 }}>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 1.5,
                                mb: 2,
                                pb: 1,
                                borderBottom: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {CASINO_GAME_TYPE_LABELS[group.type]}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {group.games.length} variant{group.games.length === 1 ? "" : "s"}
                            </Typography>
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 2.5 }}>
                            {group.games.map((game) => {
                                const oddsLabel = oddsLabelByKey[game.key];
                                const rtpLabel = rtpLabelByKey[game.key];
                                const jackpotLabel = jackpotLabelByKey[game.key];
                                return (
                                    <Card
                                        key={game.key}
                                        sx={{
                                            height: "100%",
                                            transition: "transform 0.2s, box-shadow 0.2s",
                                            "&:hover": { transform: "translateY(-4px)", boxShadow: 6 },
                                        }}
                                    >
                                        <CardActionArea onClick={() => navigate(game.path)} sx={{ height: "100%" }}>
                                            <CardContent sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2.5, "&:last-child": { pb: 2.5 } }}>
                                                {/* Header: icon + label, jackpot top-right */}
                                                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1.5 }}>
                                                    <Avatar sx={{ bgcolor: "action.hover", color: "primary.light", width: 40, height: 40, flexShrink: 0 }}>
                                                        <Icon fontSize="small" />
                                                    </Avatar>
                                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                                        <Typography variant="h6" component="h2" sx={{ fontWeight: 600, fontSize: "1.05rem", lineHeight: 1.3 }}>
                                                            {game.label}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                                            <Typography component="span" variant="body2" color="error.main" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                                                {formatCheddar(game.price)}
                                                            </Typography>
                                                            {" / play"}
                                                        </Typography>
                                                    </Box>
                                                    {jackpotLabel && (
                                                        <Chip label={jackpotLabel} size="small" sx={{ ...JACKPOT_CHIP_SX, flexShrink: 0 }} />
                                                    )}
                                                </Box>

                                                {/* Description */}
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                                    {game.description}
                                                </Typography>

                                                {/* Stats footer: odds + RTP, pushed to bottom */}
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        flexWrap: "wrap",
                                                        justifyContent: "space-between",
                                                        gap: 0.75,
                                                        mt: "auto",
                                                        pt: 1.5,
                                                        borderTop: "1px solid",
                                                        borderColor: "divider",
                                                    }}
                                                >
                                                    <Chip label={oddsLabel ?? "???"} size="small" sx={ODDS_CHIP_SX} />
                                                    <Chip label={rtpLabel ?? "???"} size="small" sx={RTP_CHIP_SX} />
                                                </Box>
                                            </CardContent>
                                        </CardActionArea>
                                    </Card>
                                );
                            })}

                            {ghostCopy && (
                                <Card
                                    variant="outlined"
                                    sx={{ height: "100%", borderStyle: "dashed", display: "flex", alignItems: "flex-start", justifyContent: "center" }}
                                >
                                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                                        <Avatar
                                            sx={{
                                                bgcolor: "transparent",
                                                border: "1px dashed",
                                                borderColor: "divider",
                                                color: "text.disabled",
                                                width: 40,
                                                height: 40,
                                            }}
                                        >
                                            <AddIcon fontSize="small" />
                                        </Avatar>
                                        <Typography variant="body1" sx={{ fontWeight: 500, color: "text.secondary" }}>
                                            More {CASINO_GAME_TYPE_LABELS[group.type].toLowerCase()} soon
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {ghostCopy}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            )}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}
