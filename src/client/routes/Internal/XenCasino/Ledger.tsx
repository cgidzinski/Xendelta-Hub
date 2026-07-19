import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography, Chip } from "@mui/material";
import { useCasinoLedger } from "../../../hooks/casino/useCasinoLedger";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import HouseBalanceBanner from "./components/HouseBalanceBanner";
import { formatCheddar } from "./utils/currency";

export default function Ledger() {
    const { entries, isLoading, isError, error } = useCasinoLedger();

    if (isLoading) {
        return <LoadingSpinner />;
    }

    if (isError) {
        return <ErrorDisplay error={error} />;
    }

    if (entries.length === 0) {
        return (
            <Box>
                <HouseBalanceBanner />
                <Box sx={{ textAlign: "center", py: 8 }}>
                    <Typography variant="h6" color="text.secondary">
                        No activity yet
                    </Typography>
                </Box>
            </Box>
        );
    }

    return (
        <Box>
            <HouseBalanceBanner />
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Player</TableCell>
                        <TableCell>Note</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell align="right">When</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {entries.map((entry) => {
                        // XenCasino "debit" = it paid out = the player won; "credit" = it took in = the player lost.
                        const playerWon = entry.entryType === "debit";
                        return (
                            <TableRow key={entry.id}>
                                <TableCell>{entry.displayName}</TableCell>
                                <TableCell>
                                    <Chip label={entry.note} size="small" color={playerWon ? "success" : "error"} variant="outlined" />
                                </TableCell>
                                <TableCell align="right" sx={{ color: playerWon ? "success.main" : "error.main", fontWeight: 600 }}>
                                    {playerWon ? "+" : "-"}{formatCheddar(entry.amount)}
                                </TableCell>
                                <TableCell align="right">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </Box>
    );
}
