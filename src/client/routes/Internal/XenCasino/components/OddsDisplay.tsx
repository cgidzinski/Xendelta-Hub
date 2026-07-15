import { Fragment } from "react";
import { Box, Typography } from "@mui/material";

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

// A flat 3 decimal places rounds tiny (but very real) probabilities - a jackpot at, say,
// 1-in-296,296 is 0.000338% - straight down to "0.000%", making a genuine rare-but-nonzero
// chance read as impossible. Scale the precision to the value itself instead: common
// outcomes still show 3 decimals, rare ones show enough digits to stay visibly nonzero.
function formatProbability(p: number): string {
    const pct = p * 100;
    if (pct <= 0) {
        return "0%";
    }
    const decimals = Math.min(6, Math.max(3, Math.ceil(-Math.log10(pct)) + 2));
    return `${pct.toFixed(decimals)}%`;
}

const headerSx = {
    fontWeight: 700,
    color: "text.secondary",
    textAlign: "center",
    pb: 0.5,
    borderBottom: "1px solid",
    borderColor: "divider",
} as const;

// A CSS grid instead of a <table> - three equal (1fr each) columns that actually shrink/wrap
// instead of forcing a fixed table width, so this fits a narrow phone screen natively rather
// than relying on horizontal scroll.
export default function OddsDisplay({ title = "Odds", rows, footnote }: OddsDisplayProps) {
    return (
        <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {title}
            </Typography>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    columnGap: 1,
                    rowGap: 0.75,
                    alignItems: "baseline",
                }}
            >
                <Typography variant="caption" sx={headerSx}>
                    Outcome
                </Typography>
                <Typography variant="caption" sx={headerSx}>
                    Probability
                </Typography>
                <Typography variant="caption" sx={headerSx}>
                    Payout
                </Typography>

                {rows.map((row, i) => (
                    <Fragment key={i}>
                        <Typography variant="body2" sx={{ textAlign: "center", overflowWrap: "anywhere" }}>
                            {row.label}
                        </Typography>
                        <Typography variant="body2" sx={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                            {row.probability !== undefined ? formatProbability(row.probability) : "—"}
                        </Typography>
                        <Typography variant="body2" sx={{ textAlign: "center" }}>
                            {row.payout ?? "—"}
                        </Typography>
                    </Fragment>
                ))}
            </Box>
            {footnote && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                    {footnote}
                </Typography>
            )}
        </Box>
    );
}
