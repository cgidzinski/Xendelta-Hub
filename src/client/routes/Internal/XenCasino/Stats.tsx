import { useState, useMemo } from "react";
import {
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import { useCasinoStats, type StatsRange } from "../../../hooks/casino/useCasinoStats";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import HouseBalanceBanner from "./components/HouseBalanceBanner";
import { formatCheddar } from "./utils/currency";

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "week", label: "Last Week" },
    { value: "all", label: "All-Time" },
];

export default function Stats() {
    const [range, setRange] = useState<StatsRange>("all");
    const { games, isLoading, isError, error } = useCasinoStats(range);

    const totals = useMemo(() => {
        return games.reduce(
            (acc, g) => ({
                winAmount: acc.winAmount + parseFloat(g.winAmount),
                lossAmount: acc.lossAmount + parseFloat(g.lossAmount),
                roundsPlayed: acc.roundsPlayed + g.roundsPlayed,
            }),
            { winAmount: 0, lossAmount: 0, roundsPlayed: 0 }
        );
    }, [games]);

    const hasData = games.length > 0;

    return (
        <Box>
            <HouseBalanceBanner />

            <Box sx={{ mb: 3, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Game Stats
                </Typography>
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

            {isLoading && <LoadingSpinner />}

            {isError && !isLoading && <ErrorDisplay error={error} />}

            {!isLoading && !isError && !hasData && (
                <Box sx={{ textAlign: "center", py: 8 }}>
                    <Typography variant="h6" color="text.secondary">
                        No activity yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Stats will appear here once games have been played.
                    </Typography>
                </Box>
            )}

            {!isLoading && !isError && hasData && (
                <Paper variant="outlined">
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Game</TableCell>
                                <TableCell align="right">Rounds</TableCell>
                                <TableCell align="right">Losses</TableCell>
                                <TableCell align="right">Wins</TableCell>
                                <TableCell align="right">Net</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {games.map((game) => {
                                const win = parseFloat(game.winAmount);
                                const loss = parseFloat(game.lossAmount);
                                const net = win - loss;
                                const netColor = net > 0 ? "success.main" : net < 0 ? "error.main" : "text.secondary";

                                return (
                                    <TableRow key={game.slug}>
                                        <TableCell sx={{ fontWeight: 600 }}>{game.label}</TableCell>
                                        <TableCell align="right">{game.roundsPlayed.toLocaleString()}</TableCell>
                                        <TableCell align="right" sx={{ color: "error.main", fontWeight: 500 }}>
                                            {formatCheddar(loss.toFixed(2))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: "success.main", fontWeight: 500 }}>
                                            {formatCheddar(win.toFixed(2))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: netColor, fontWeight: 700 }}>
                                            {net > 0 ? "+" : ""}{formatCheddar(net.toFixed(2))}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableHead>
                            <TableRow sx={{ "& > td, & > th": { borderBottom: "none" } }}>
                                <TableCell sx={{ fontWeight: 700 }}>Totals</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {totals.roundsPlayed.toLocaleString()}
                                </TableCell>
                                <TableCell align="right" sx={{ color: "error.main", fontWeight: 700 }}>
                                    {formatCheddar(totals.lossAmount.toFixed(2))}
                                </TableCell>
                                <TableCell align="right" sx={{ color: "success.main", fontWeight: 700 }}>
                                    {formatCheddar(totals.winAmount.toFixed(2))}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: totals.winAmount - totals.lossAmount > 0 ? "success.main" : totals.winAmount - totals.lossAmount < 0 ? "error.main" : "text.secondary" }}>
                                    {totals.winAmount - totals.lossAmount > 0 ? "+" : ""}
                                    {formatCheddar((totals.winAmount - totals.lossAmount).toFixed(2))}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                    </Table>
                </Paper>
            )}
        </Box>
    );
}
