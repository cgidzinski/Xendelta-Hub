import { Card, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { cardSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { formatCurrency } from "../currency";

interface TotalsSummaryProps {
    income: number;
    expense: number;
    net: number;
    currency: string;
    sx?: SxProps<Theme>;
    /** Skip the own outlined Card - for embedding inside a caller's own bordered box. */
    bare?: boolean;
}

/**
 * The In/Out/Net headline shared by Overview and Report. Stacked label/value rows keep
 * every figure readable at narrow widths — side-by-side columns ellipsize — while tighter
 * padding and body-size values stay denser than three `h6` rows.
 */
export default function TotalsSummary({ income, expense, net, currency, sx, bare }: TotalsSummaryProps) {
    const rows = (
        <Stack spacing={0.5}>
            <Row label="In" value={income} currency={currency} color="success.main" />
            <Row label="Out" value={expense} currency={currency} color="error.main" />
            <Row
                label="Net" value={net} currency={currency}
                color={net < 0 ? "error.main" : "success.main"} signed
            />
        </Stack>
    );

    if (bare) {
        return <Stack spacing={0.5} sx={sx}>{rows}</Stack>;
    }
    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.25, ...sx }}>
            {rows}
        </Card>
    );
}

function Row({ label, value, currency, color, signed }: {
    label: string; value: number; currency: string; color: string; signed?: boolean;
}) {
    return (
        <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" sx={sectionLabelSx}>{label}</Typography>
            <Typography variant="body1" sx={{ color, fontWeight: 600 }} noWrap>
                {signed && value > 0 ? "+" : ""}{formatCurrency(value, currency)}
            </Typography>
        </Stack>
    );
}
