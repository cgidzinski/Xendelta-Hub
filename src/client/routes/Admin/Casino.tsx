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
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Switch,
    FormControlLabel,
    Chip,
    Divider,
    Autocomplete,
    TextField,
    Avatar,
    CircularProgress,
    Tabs,
    Tab,
    TableSortLabel,
} from "@mui/material";
import { useSnackbar } from "notistack";
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
import {
    useAdminCasino,
    useAdminCasinoDailyStats,
    useAdminCasinoGames,
    useAdminCasinoDiscordUsers,
    useAdminUserWallet,
    useAdminSendMoney,
    useAdminCasinoPlayerStats,
    type StatsRange,
    type DiscordLinkedUser,
    type AdminCasinoPlayerStats,
} from "../../hooks/admin/useAdminCasino";
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
    const { enqueueSnackbar } = useSnackbar();
    const [range, setRange] = useState<StatsRange>("all");
    const [activeTab, setActiveTab] = useState<"games" | "players">("games");
    const [clearJackpotsOpen, setClearJackpotsOpen] = useState(false);
    const [clearStatsOpen, setClearStatsOpen] = useState(false);
    const [closeCasinoOpen, setCloseCasinoOpen] = useState(false);
    const { games, isLoading, isError, error, clearJackpots, isClearingJackpots, clearStats, isClearingStats } = useAdminCasino(range);
    const { players, isLoading: playersLoading, isError: playersIsError, error: playersError } = useAdminCasinoPlayerStats(range);
    const [playerSort, setPlayerSort] = useState<{ key: "net" | "roundsPlayed" | "lossAmount" | "winAmount"; dir: "asc" | "desc" }>({ key: "net", dir: "desc" });
    const { dailyStats, isLoading: chartLoading } = useAdminCasinoDailyStats(5);
    const {
        games: gameToggles,
        casino: casinoControlStatus,
        isLoading: gamesLoading,
        toggleGame,
        isTogglingGame,
        toggleCasinoOpen,
        isTogglingCasinoOpen,
    } = useAdminCasinoGames();

    // Send Cheddar panel state
    const [selectedRecipient, setSelectedRecipient] = useState<DiscordLinkedUser | null>(null);
    const [sendAmount, setSendAmount] = useState("");
    const [sendNote, setSendNote] = useState("");
    const [sendRequestId, setSendRequestId] = useState<string | null>(null);
    const { users: discordUsers, isLoading: discordUsersLoading } = useAdminCasinoDiscordUsers();
    const { wallet, isLoading: walletLoading } = useAdminUserWallet(selectedRecipient?._id ?? null);
    const { sendMoney, isSendingMoney } = useAdminSendMoney();

    const handleClearJackpots = async () => {
        try {
            await clearJackpots();
            enqueueSnackbar("All jackpots cleared", { variant: "success" });
        } catch (err) {
            enqueueSnackbar(err instanceof Error ? err.message : "Failed to clear jackpots", { variant: "error" });
        } finally {
            setClearJackpotsOpen(false);
        }
    };

    const handleClearStats = async () => {
        try {
            await clearStats();
            enqueueSnackbar("Casino stats cleared", { variant: "success" });
        } catch (err) {
            enqueueSnackbar(err instanceof Error ? err.message : "Failed to clear stats", { variant: "error" });
        } finally {
            setClearStatsOpen(false);
        }
    };

    const handleToggleGame = async (slug: string, disabled: boolean) => {
        try {
            await toggleGame({ slug, disabled });
            enqueueSnackbar(disabled ? "Game disabled" : "Game enabled", { variant: "success" });
        } catch (err) {
            enqueueSnackbar(err instanceof Error ? err.message : "Failed to update game", { variant: "error" });
        }
    };

    const handleCloseCasino = async () => {
        try {
            await toggleCasinoOpen(false);
            enqueueSnackbar("Casino closed", { variant: "success" });
        } catch (err) {
            enqueueSnackbar(err instanceof Error ? err.message : "Failed to close casino", { variant: "error" });
        } finally {
            setCloseCasinoOpen(false);
        }
    };

    const handleReopenCasino = async () => {
        try {
            await toggleCasinoOpen(true);
            enqueueSnackbar("Casino reopened", { variant: "success" });
        } catch (err) {
            enqueueSnackbar(err instanceof Error ? err.message : "Failed to reopen casino", { variant: "error" });
        }
    };

    const ensureSendRequestId = () => {
        if (sendRequestId) return sendRequestId;
        const id = crypto.randomUUID();
        setSendRequestId(id);
        return id;
    };

    const handleSendAmountChange = (value: string) => {
        setSendAmount(value);
        setSendRequestId(null);
    };

    const handleSendNoteChange = (value: string) => {
        setSendNote(value);
        setSendRequestId(null);
    };

    const handleRecipientChange = (recipient: DiscordLinkedUser | null) => {
        setSelectedRecipient(recipient);
        setSendAmount("");
        setSendNote("");
        setSendRequestId(null);
    };

    const handleSendMoney = async () => {
        if (!selectedRecipient) return;
        const amountNum = Number(sendAmount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) return;

        try {
            const result = await sendMoney({
                userId: selectedRecipient._id,
                amount: amountNum,
                note: sendNote,
                requestId: ensureSendRequestId(),
            });
            enqueueSnackbar(`Sent ${amountNum.toLocaleString()} cheddar to ${selectedRecipient.username}. New balance: ${formatCheddar(result.balance)}`, { variant: "success" });
            setSendAmount("");
            setSendNote("");
            setSendRequestId(null);
        } catch (err) {
            enqueueSnackbar(err instanceof Error ? err.message : "Failed to send cheddar", { variant: "error" });
        }
    };

    const handlePlayerSort = (key: typeof playerSort.key) => {
        setPlayerSort((prev) => (prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
    };

    const sortedPlayers = useMemo(() => {
        const numeric = (p: AdminCasinoPlayerStats) => (playerSort.key === "roundsPlayed" ? p.roundsPlayed : parseFloat(p[playerSort.key]));
        const sorted = [...players].sort((a, b) => numeric(a) - numeric(b));
        return playerSort.dir === "desc" ? sorted.reverse() : sorted;
    }, [players, playerSort]);

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
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Button color="error" variant="outlined" size="small" onClick={() => setClearJackpotsOpen(true)}>
                        Clear Jackpots
                    </Button>
                    <Button color="error" variant="outlined" size="small" onClick={() => setClearStatsOpen(true)}>
                        Clear Stats
                    </Button>
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
            </Box>

            <Dialog open={clearJackpotsOpen} onClose={() => setClearJackpotsOpen(false)}>
                <DialogTitle>Clear All Jackpots?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        This resets every progressive jackpot pool (Easy Spin, Spinmania, and Pachinko) back to zero. This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClearJackpotsOpen(false)} disabled={isClearingJackpots}>
                        Cancel
                    </Button>
                    <Button color="error" variant="contained" onClick={handleClearJackpots} disabled={isClearingJackpots}>
                        Clear Jackpots
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={clearStatsOpen} onClose={() => setClearStatsOpen(false)}>
                <DialogTitle>Clear All Stats?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        This permanently deletes every recorded round (wagered/won amounts, rounds played, and the
                        daily chart history) for every game. Jackpot pools, the live house balance, and any
                        in-progress rounds are not affected. This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClearStatsOpen(false)} disabled={isClearingStats}>
                        Cancel
                    </Button>
                    <Button color="error" variant="contained" onClick={handleClearStats} disabled={isClearingStats}>
                        Clear Stats
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={closeCasinoOpen} onClose={() => setCloseCasinoOpen(false)}>
                <DialogTitle>Close the Casino?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        Every player will immediately see a "closed" takeover and won't be able to place any new
                        wagers, on any game, until you reopen it.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCloseCasinoOpen(false)} disabled={isTogglingCasinoOpen}>
                        Cancel
                    </Button>
                    <Button color="error" variant="contained" onClick={handleCloseCasino} disabled={isTogglingCasinoOpen}>
                        Close Casino
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Casino Controls */}
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2, mb: 2 }}>
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            Casino Status
                        </Typography>
                        {casinoControlStatus && (
                            <Typography variant="body2" color="text.secondary">
                                Bank balance: {formatCheddar(casinoControlStatus.bankBalance)} cheddar (needs {formatCheddar(casinoControlStatus.minBankBalance)} to stay open)
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        {casinoControlStatus && !casinoControlStatus.open && (
                            <Chip
                                label={casinoControlStatus.reason === "broke" ? "Auto-closed: bank too low" : "Manually closed"}
                                color="error"
                                size="small"
                            />
                        )}
                        {casinoControlStatus?.open ? (
                            <Button color="error" variant="outlined" size="small" onClick={() => setCloseCasinoOpen(true)}>
                                Close Casino
                            </Button>
                        ) : (
                            <Button
                                color="success"
                                variant="outlined"
                                size="small"
                                onClick={handleReopenCasino}
                                disabled={isTogglingCasinoOpen}
                            >
                                Reopen Casino
                            </Button>
                        )}
                    </Box>
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Games
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 1 }}>
                    {!gamesLoading &&
                        gameToggles.map((game) => (
                            <FormControlLabel
                                key={game.slug}
                                control={
                                    <Switch
                                        checked={!game.disabled}
                                        onChange={(e) => handleToggleGame(game.slug, !e.target.checked)}
                                        disabled={isTogglingGame}
                                    />
                                }
                                label={game.label}
                            />
                        ))}
                </Box>
            </Paper>

            {/* Send Cheddar */}
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                    Send Cheddar
                </Typography>
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <Autocomplete<DiscordLinkedUser>
                        options={discordUsers}
                        loading={discordUsersLoading}
                        value={selectedRecipient}
                        onChange={(_, newValue) => handleRecipientChange(newValue)}
                        getOptionLabel={(option) => option.username}
                        isOptionEqualToValue={(option, val) => option._id === val._id}
                        sx={{ minWidth: 260 }}
                        renderOption={(props, option) => (
                            <Box component="li" {...props} key={option._id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
                                <Avatar src={option.avatar || undefined} sx={{ width: 28, height: 28 }}>
                                    {option.username[0]?.toUpperCase()}
                                </Avatar>
                                <Box>
                                    <Typography variant="body2">{option.username}</Typography>
                                    <Typography variant="caption" color="text.secondary">{option.discordId}</Typography>
                                </Box>
                            </Box>
                        )}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                size="small"
                                label="Recipient"
                                placeholder="Search Discord-linked users..."
                                InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                        <>
                                            {discordUsersLoading ? <CircularProgress color="inherit" size={16} /> : null}
                                            {params.InputProps.endAdornment}
                                        </>
                                    ),
                                }}
                            />
                        )}
                    />
                    <TextField
                        size="small"
                        label="Amount"
                        type="number"
                        value={sendAmount}
                        onChange={(e) => handleSendAmountChange(e.target.value)}
                        disabled={!selectedRecipient}
                        sx={{ width: 160 }}
                    />
                    <TextField
                        size="small"
                        label="Note (optional)"
                        value={sendNote}
                        onChange={(e) => handleSendNoteChange(e.target.value)}
                        disabled={!selectedRecipient}
                        sx={{ width: 240 }}
                    />
                    <Button
                        variant="contained"
                        onClick={handleSendMoney}
                        disabled={isSendingMoney || !selectedRecipient || !sendAmount || Number(sendAmount) <= 0 || wallet?.linked === false}
                        sx={{ height: 40 }}
                    >
                        {isSendingMoney ? "Sending..." : "Send"}
                    </Button>
                </Box>
                {selectedRecipient && (
                    <Box sx={{ mt: 1.5 }}>
                        {walletLoading ? (
                            <CircularProgress size={16} />
                        ) : wallet?.linked === false ? (
                            <Typography variant="body2" color="error">
                                This user has no linked Discord account - cannot send cheddar.
                            </Typography>
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                Current balance: {formatCheddar(wallet?.balance ?? null)} cheddar
                            </Typography>
                        )}
                    </Box>
                )}
            </Paper>

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

            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab value="games" label="Games" />
                <Tab value="players" label="Players" />
            </Tabs>

            {activeTab === "games" && (
                <>
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
                </>
            )}

            {activeTab === "players" && (
                <>
                    {playersLoading && <LoadingSpinner />}

                    {playersIsError && !playersLoading && <ErrorDisplay error={playersError} />}

                    {!playersLoading && !playersIsError && (
                        <Paper variant="outlined">
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Player</TableCell>
                                        <TableCell align="right">
                                            <TableSortLabel active={playerSort.key === "roundsPlayed"} direction={playerSort.dir} onClick={() => handlePlayerSort("roundsPlayed")}>
                                                Plays
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell align="right">
                                            <TableSortLabel active={playerSort.key === "lossAmount"} direction={playerSort.dir} onClick={() => handlePlayerSort("lossAmount")}>
                                                Amount In
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell align="right">
                                            <TableSortLabel active={playerSort.key === "winAmount"} direction={playerSort.dir} onClick={() => handlePlayerSort("winAmount")}>
                                                Amount Out
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell align="right">
                                            <TableSortLabel active={playerSort.key === "net"} direction={playerSort.dir} onClick={() => handlePlayerSort("net")}>
                                                Net
                                            </TableSortLabel>
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedPlayers.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5}>
                                                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                                                    No recorded activity for this range
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {sortedPlayers.map((player) => {
                                        const net = parseFloat(player.net);
                                        const netColor = net > 0 ? "success.main" : net < 0 ? "error.main" : "text.secondary";

                                        return (
                                            <TableRow key={player.userId}>
                                                <TableCell>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                                        <Avatar src={player.avatar || undefined} sx={{ width: 28, height: 28 }}>
                                                            {player.username[0]?.toUpperCase()}
                                                        </Avatar>
                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                            {player.username}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell align="right">{player.roundsPlayed.toLocaleString()}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 500 }}>
                                                    {formatCheddar(player.lossAmount)}
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 500 }}>
                                                    {formatCheddar(player.winAmount)}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: netColor, fontWeight: 700 }}>
                                                    {net > 0 ? "+" : ""}{formatCheddar(player.net)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </Paper>
                    )}
                </>
            )}
        </Container>
    );
}
