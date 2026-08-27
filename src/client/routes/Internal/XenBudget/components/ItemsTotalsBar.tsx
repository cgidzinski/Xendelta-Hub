import { Box, Stack, Typography } from "@mui/material";
import type { ItemsTotals } from "../../../../hooks/xenbudget/types";
import { formatCurrency } from "../currency";
import { cardSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { INCOME_COLOR } from "../../../../components/ui/chartColors";

interface ItemsTotalsBarProps {
    totals: ItemsTotals[];
}

/**
 * What the Items tab's current filters add up to, over every matching item rather than
 * the pages loaded so far.
 *
 * Deliberately NOT TotalsSummary: that one's stacked label-above-value rows are sized to
 * be the headline of the Overview and the Report. Here the figures sit under a filter bar
 * with a list below them, so they run along one line and wrap rather than taking three
 * rows of vertical space away from the items themselves.
 */
export default function ItemsTotalsBar({ totals }: ItemsTotalsBarProps) {
    if (totals.length === 0) return null;
    // narrowSymbol renders CAD and USD alike as "$", so once there is more than one row
    // the code has to be said out loud or the two are indistinguishable.
    const nameCurrency = totals.length > 1;
    return (
        <Stack spacing={0.5}>
            {totals.map((t) => (
                <Box
                    key={t.currency}
                    sx={{
                        ...cardSx,
                        px: 1.25, py: 0.75,
                        display: "flex", alignItems: "center",
                        columnGap: 2, rowGap: 0.5, flexWrap: "wrap",
                    }}
                >
                    {nameCurrency && (
                        <Typography variant="caption" sx={sectionLabelSx}>{t.currency}</Typography>
                    )}
                    <Figure label="In" value={t.income} currency={t.currency} color={INCOME_COLOR} />
                    <Figure label="Out" value={t.expense} currency={t.currency} color="error.main" />
                    <Figure
                        label="Net" value={t.net} currency={t.currency}
                        color={t.net < 0 ? "error.main" : INCOME_COLOR} signed
                    />
                    {/* Pushed to the far end: the count is what the figures were taken
                    over, not one of the figures. */}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                        {t.count} {t.count === 1 ? "item" : "items"}
                    </Typography>
                </Box>
            ))}
        </Stack>
    );
}

function Figure({ label, value, currency, color, signed }: {
    label: string; value: number; currency: string; color: string; signed?: boolean;
}) {
    return (
        <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={sectionLabelSx}>{label}</Typography>
            <Typography variant="body2" sx={{ color, fontWeight: 600 }} noWrap>
                {signed && value > 0 ? "+" : ""}{formatCurrency(value, currency)}
            </Typography>
        </Stack>
    );
}
