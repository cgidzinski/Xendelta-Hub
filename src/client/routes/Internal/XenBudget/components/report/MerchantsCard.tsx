import { useState } from "react";
import {
    Box, Button, Card, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import StorefrontIcon from "@mui/icons-material/Storefront";
import type {
    XenBudgetLabel, XenBudgetMerchant,
} from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import { formatCurrency } from "../../currency";
import { MAGNITUDE_COLOR } from "../../../../../components/ui/chartColors";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";

// Enough to see where the money concentrates without becoming the items list.
const COLLAPSED_ROWS = 8;

interface MerchantsCardProps {
    merchants: XenBudgetMerchant[];
    /** Every merchant in the window, so the tail can be named rather than silently dropped. */
    merchantCount: number;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    onViewItems: (merchant: XenBudgetMerchant) => void;
    /** Opens the rule form prefilled to match this merchant. */
    onMakeRule: (merchant: XenBudgetMerchant) => void;
}

/**
 * Where the money actually went.
 *
 * Category answers "what kind of spending"; this answers "who was paid", which is the
 * question a rule gets written from — hence the wand on every row. The bars are drawn
 * inline rather than in recharts: they're a magnitude comparison inside a list, and a
 * charting library would add an axis, a tooltip and a container to say the same thing.
 */
export default function MerchantsCard({
    merchants, merchantCount, currency, categoryRegistry, onViewItems, onMakeRule,
}: MerchantsCardProps) {
    const [expanded, setExpanded] = useState(false);
    if (merchants.length === 0) return null;

    const shown = expanded ? merchants : merchants.slice(0, COLLAPSED_ROWS);
    // Bars are read against the biggest merchant, not against the book's total: the point
    // is which of these is largest, and scaling to a total nobody is looking at would
    // leave every bar a stub.
    const biggest = merchants[0].total;

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
                <Typography variant="caption" sx={sectionLabelSx}>Top merchants</Typography>
                {merchantCount > merchants.length && (
                    <Typography variant="caption" color="text.secondary">
                        of {merchantCount}
                    </Typography>
                )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                Grouped by merchant name, with card reference numbers stripped.
            </Typography>

            <Stack spacing={1.25}>
                {shown.map((merchant) => (
                    <Box key={merchant.merchant}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                            <Box sx={{
                                width: 22, height: 22, borderRadius: 1, flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                bgcolor: `${MAGNITUDE_COLOR}22`,
                            }}>
                                <StorefrontIcon sx={{ fontSize: 13, color: MAGNITUDE_COLOR }} />
                            </Box>
                            <Typography
                                variant="body2" noWrap
                                onClick={() => onViewItems(merchant)}
                                sx={{ minWidth: 0, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                            >
                                {merchant.merchant}
                            </Typography>
                            {merchant.categories[0] && (
                                <CategoryChip
                                    name={merchant.categories[0]}
                                    registry={categoryRegistry}
                                    sx={{ flexShrink: 0 }}
                                />
                            )}
                            <Box sx={{ flexGrow: 1 }} />
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                                ×{merchant.count}
                            </Typography>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600, flexShrink: 0 }}>
                                {formatCurrency(merchant.total, currency)}
                            </Typography>
                            <Tooltip title={`Make a rule for ${merchant.merchant}`}>
                                <IconButton
                                    size="small"
                                    onClick={() => onMakeRule(merchant)}
                                    sx={{ flexShrink: 0 }}
                                >
                                    <AutoFixHighIcon sx={{ fontSize: 15 }} />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                        <Box sx={{
                            height: 5, borderRadius: 1, overflow: "hidden",
                            bgcolor: (theme) => theme.palette.action.hover,
                        }}>
                            <Box sx={{
                                height: "100%",
                                width: `${biggest > 0 ? (merchant.total / biggest) * 100 : 0}%`,
                                bgcolor: MAGNITUDE_COLOR,
                            }} />
                        </Box>
                    </Box>
                ))}
            </Stack>

            {merchants.length > COLLAPSED_ROWS && (
                <Button size="small" onClick={() => setExpanded((v) => !v)} sx={{ mt: 1 }}>
                    {expanded ? "Show less" : `Show all ${merchants.length}`}
                </Button>
            )}
        </Card>
    );
}
