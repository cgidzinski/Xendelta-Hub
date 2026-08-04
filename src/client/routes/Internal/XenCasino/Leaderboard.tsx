import { useState } from "react";
import { Avatar, Box, Grid, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import CasinoIcon from "@mui/icons-material/Casino";
import SentimentVeryDissatisfiedIcon from "@mui/icons-material/SentimentVeryDissatisfied";
import {
    useCasinoLeaderboard,
    type LeaderboardRange,
    type LeaderboardPlayerEntry,
    type LeaderboardBiggestWinEntry,
} from "../../../hooks/casino/useCasinoLeaderboard";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import HouseBalanceBanner from "./components/HouseBalanceBanner";
import { formatCheddar } from "./utils/currency";
import { CASINO_GAMES_REGISTRY } from "./gamesRegistry";

const RANGE_OPTIONS: { value: LeaderboardRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "week", label: "Week" },
    { value: "all", label: "All Time" },
];

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"]; // gold, silver, bronze

const GAME_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
    CASINO_GAMES_REGISTRY.map((g) => [g.key, g.label])
);

function RankBadge({ rank }: { rank: number }) {
    return (
        <Box
            sx={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
                bgcolor: RANK_COLORS[rank - 1] || "action.selected",
                color: rank <= 3 ? "#000" : "text.secondary",
            }}
        >
            {rank}
        </Box>
    );
}

interface BoardPanelProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    isEmpty: boolean;
}

function BoardPanel({ title, icon, children, isEmpty }: BoardPanelProps) {
    return (
        <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                {icon}
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {title}
                </Typography>
            </Box>
            {isEmpty ? (
                <Typography variant="body2" color="text.secondary">
                    No activity yet
                </Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>{children}</Box>
            )}
        </Paper>
    );
}

function PlayerRow({ entry, valueColor }: { entry: LeaderboardPlayerEntry; valueColor: "success" | "error" | "text" }) {
    const color = valueColor === "text" ? "text.primary" : `${valueColor}.main`;
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <RankBadge rank={entry.rank} />
            <Avatar src={entry.avatar || undefined} sx={{ width: 28, height: 28 }}>
                {entry.username[0]?.toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {entry.username}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color, flexShrink: 0 }}>
                {formatCheddar(entry.netWinnings)}
            </Typography>
        </Box>
    );
}

function RoundsRow({ entry }: { entry: LeaderboardPlayerEntry }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <RankBadge rank={entry.rank} />
            <Avatar src={entry.avatar || undefined} sx={{ width: 28, height: 28 }}>
                {entry.username[0]?.toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {entry.username}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }}>
                {entry.roundsPlayed} rounds
            </Typography>
        </Box>
    );
}

function BiggestWinRow({ entry }: { entry: LeaderboardBiggestWinEntry }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <RankBadge rank={entry.rank} />
            <Avatar src={entry.avatar || undefined} sx={{ width: 28, height: 28 }}>
                {entry.username[0]?.toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                    {entry.username}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                    {GAME_LABEL_BY_KEY[entry.game] || entry.game}
                </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "success.main", flexShrink: 0 }}>
                {formatCheddar(entry.amount)}
            </Typography>
        </Box>
    );
}

export default function Leaderboard() {
    const [range, setRange] = useState<LeaderboardRange>("all");
    const { netWinners, netLosers, mostRounds, biggestWins, isLoading, isError, error } = useCasinoLeaderboard(range);

    if (isLoading) {
        return <LoadingSpinner />;
    }

    if (isError) {
        return <ErrorDisplay error={error} />;
    }

    return (
        <Box>
            <HouseBalanceBanner />

            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                <ToggleButtonGroup
                    value={range}
                    exclusive
                    onChange={(_, v) => v && setRange(v)}
                    size="small"
                    color="primary"
                >
                    {RANGE_OPTIONS.map((opt) => (
                        <ToggleButton key={opt.value} value={opt.value} sx={{ px: 2 }}>
                            {opt.label}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <BoardPanel title="Biggest Net Wins" icon={<EmojiEventsIcon sx={{ color: "#FFD700" }} />} isEmpty={netWinners.length === 0}>
                        {netWinners.map((entry) => (
                            <PlayerRow key={entry.userId} entry={entry} valueColor="success" />
                        ))}
                    </BoardPanel>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <BoardPanel
                        title="Biggest Net Losers"
                        icon={<SentimentVeryDissatisfiedIcon sx={{ color: "error.main" }} />}
                        isEmpty={netLosers.length === 0}
                    >
                        {netLosers.map((entry) => (
                            <PlayerRow key={entry.userId} entry={entry} valueColor="error" />
                        ))}
                    </BoardPanel>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <BoardPanel title="Biggest Wins" icon={<WhatshotIcon sx={{ color: "#f43f5e" }} />} isEmpty={biggestWins.length === 0}>
                        {biggestWins.map((entry) => (
                            <BiggestWinRow key={`${entry.userId}-${entry.rank}`} entry={entry} />
                        ))}
                    </BoardPanel>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <BoardPanel title="Most Rounds Played" icon={<CasinoIcon color="primary" />} isEmpty={mostRounds.length === 0}>
                        {mostRounds.map((entry) => (
                            <RoundsRow key={entry.userId} entry={entry} />
                        ))}
                    </BoardPanel>
                </Grid>
            </Grid>
        </Box>
    );
}
