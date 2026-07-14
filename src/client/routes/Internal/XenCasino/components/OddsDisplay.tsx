import { Paper, Typography, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";

export interface OddsRow {
    label: string;
    probability?: number;
    payout?: string;
}

interface OddsDisplayProps {
    title?: string;
    rows: OddsRow[];
    footnote?: string;
}

export default function OddsDisplay({ title = "Odds", rows, footnote }: OddsDisplayProps) {
    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {title}
            </Typography>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Outcome</TableCell>
                        <TableCell align="right">Probability</TableCell>
                        <TableCell align="right">Payout</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row, i) => (
                        <TableRow key={i}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell align="right">
                                {row.probability !== undefined ? `${(row.probability * 100).toFixed(3)}%` : "—"}
                            </TableCell>
                            <TableCell align="right">{row.payout ?? "—"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {footnote && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                    {footnote}
                </Typography>
            )}
        </Paper>
    );
}
