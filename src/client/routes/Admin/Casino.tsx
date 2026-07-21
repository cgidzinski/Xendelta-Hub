import { useState, useMemo } from "react";
import {
    Box,
    Container,
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
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { useAdminCasino, useAdminCasinoDailyStats, type StatsRange } from "../../hooks/admin/useAdminCasino";
import { useTitle } from "../../hooks/useTitle";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";
import { formatCheddar } from "../Internal/XenCasino/utils/currency";

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "week", label: "Week" },
    { value: "all", label: "All Time" },
];

const CHART_COLORS = {
    amountIn: "#22d3ee",
    amountOut: "#f43f5e",
    net: "#a78bfa",
    balance: "#10b981",
};

function formatChartCheddar(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return value.toFixed(0);
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <Box
            sx={{
                backgroundColor: "rgba(30,30,30,0.95)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 1,
                p: 1.5,
                minWidth: 140,
            }}
        >
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)", fontWeight: 600, mb: 0.5, display: "block" }}>
                {label}
            </Typography>
            {payload.map((entry: any) => (
                <Box key={entry.dataKey} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.25 }}>
                    <Typography variant="caption" sx={{ color: entry.color }}>
                        {entry.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#fff", fontWeight: 600 }}>
                        {formatCheddar(entry.value)}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}

export default function Casino() {
    useTitle("Casino");
    const [range, setRange] = useState<StatsRange>("all");
    const { games, isLoading, isError, error } = useAdminCasino(range);
    const { dailyStats, isLoading: chartLoading } = useAdminCasinoDailyStats(5);

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

    const chartData = useMemo(() => {
        return dailyStats.map((d) => ({
            ...d,
            label: format(parseISO(d.date), "MMM d"),
        }));
    }, [dailyStats]);

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            <Box sx={{ mb: 3, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Casino Stats
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

            {/* Daily chart */}
            {!chartLoading && chartData.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        Last {chartData.length} Days
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={formatChartCheddar} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={formatChartCheddar} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="amountIn" name="Amount In" fill={CHART_COLORS.amountIn} radius={[3, 3, 0, 0]} />
                            <Bar yAxisId="left" dataKey="amountOut" name="Amount Out" fill={CHART_COLORS.amountOut} radius={[3, 3, 0, 0]} />
                            <Line yAxisId="left" type="monotone" dataKey="net" name="Net" stroke={CHART_COLORS.net} strokeWidth={2} dot={{ r: 4 }} />
                            <Line yAxisId="right" type="monotone" dataKey="balance" name="Balance" stroke={CHART_COLORS.balance} strokeWidth={2} dot={{ r: 4 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Paper>
            )}

            {isLoading && <LoadingSpinner />}

            {isError && !isLoading && <ErrorDisplay error={error} />}

            {!isLoading && !isError && (
                <Paper variant="outlined">
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Game</TableCell>
                                <TableCell align="right">Plays</TableCell>
                                <TableCell align="right">Amount In</TableCell>
                                <TableCell align="right">Amount Out</TableCell>
                                <TableCell align="right">Net</TableCell>
                                <TableCell align="right">Jackpot</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {games.map((game) => {
                                const win = parseFloat(game.winAmount);
                                const loss = parseFloat(game.lossAmount);
                                const net = loss - win;
                                const netColor = net > 0 ? "success.main" : net < 0 ? "error.main" : "text.secondary";

                                return (
                                    <TableRow key={game.slug}>
                                        <TableCell sx={{ fontWeight: 600 }}>{game.label}</TableCell>
                                        <TableCell align="right">{game.roundsPlayed.toLocaleString()}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 500 }}>
                                            {formatCheddar(loss.toFixed(2))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 500 }}>
                                            {formatCheddar(win.toFixed(2))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: netColor, fontWeight: 700 }}>
                                            {net > 0 ? "+" : ""}{formatCheddar(net.toFixed(2))}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 500 }}>
                                            {game.jackpotPool !== null ? formatCheddar(game.jackpotPool) : "—"}
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
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCheddar(totals.lossAmount.toFixed(2))}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCheddar(totals.winAmount.toFixed(2))}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    sx={{
                                        fontWeight: 700,
                                        color:
                                            totals.lossAmount - totals.winAmount > 0
                                                ? "success.main"
                                                : totals.lossAmount - totals.winAmount < 0
                                                    ? "error.main"
                                                    : "text.secondary",
                                    }}
                                >
                                    {totals.lossAmount - totals.winAmount > 0 ? "+" : ""}
                                    {formatCheddar((totals.lossAmount - totals.winAmount).toFixed(2))}
                                </TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                    </Table>
                </Paper>
            )}
        </Container>
    );
}
