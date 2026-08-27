import { useMemo, useState } from "react";
import {
    Box, Button, Card, Chip, Stack, Tooltip, Typography, alpha,
} from "@mui/material";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import type {
    XenBudgetLabel, XenBudgetRecurringSeries, XenBudgetRule,
} from "../../../../../hooks/xenbudget/types";
import RuleCoverageAction from "../rules/RuleCoverageAction";
import { CategoryChip } from "../LabelChip";
import { formatCurrency } from "../../currency";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { xbCardSx } from "../rowStyles";
import { cadenceLabel, recentPriceRise } from "./recurringDisplay";

// Long enough to show the bills that matter without turning the Overview into a list
// page; the rest are one click away behind "Show all".
const COLLAPSED_ROWS = 6;

interface RecurringCardProps {
    series: XenBudgetRecurringSeries[];
    monthlyCommitted: number;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    /** Opens the Items tab filtered to this merchant. */
    onViewItems: (series: XenBudgetRecurringSeries) => void;
    /** Opens the rule form prefilled to match this series' merchant. */
    onMakeRule: (series: XenBudgetRecurringSeries) => void;
    /** Opens an existing rule. False when the id no longer resolves. */
    onOpenRule: (ruleId: string) => boolean;
    /** The book's rules, for naming whichever already covers a series. */
    rules: XenBudgetRule[];
}

/**
 * Subscriptions and bills, derived from imported history rather than stored.
 *
 * The headline is committed monthly spend — the figure that says how much of next month is
 * already spoken for before anyone buys anything. Individual rows lead with the monthly
 * equivalent for the same reason the server sorts by it: a $240 yearly renewal is $20 of
 * the month, and ranking it above a $90 internet bill would be misleading.
 */
export default function RecurringCard({
    series, monthlyCommitted, currency, categoryRegistry, onViewItems,
    onMakeRule, onOpenRule, rules,
}: RecurringCardProps) {
    const [expanded, setExpanded] = useState(false);
    // One instant for the whole render, so two rows can't be classified against
    // different "now"s part-way down the list.
    const now = useMemo(() => new Date(), []);

    // Ended series are history: they're excluded from the committed total, so showing them
    // in the same list as live commitments would make the rows disagree with the headline.
    const live = useMemo(() => series.filter((s) => s.status !== "ended"), [series]);
    if (live.length === 0) return null;

    const shown = expanded ? live : live.slice(0, COLLAPSED_ROWS);
    const missingCount = live.filter((s) => s.status === "missing").length;

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.75, mb: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" sx={sectionLabelSx}>Recurring</Typography>
                {missingCount > 0 && (
                    <Typography variant="caption" color="warning.main">
                        {missingCount} not yet posted
                    </Typography>
                )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                {formatCurrency(monthlyCommitted, currency)} a month committed across{" "}
                {live.length} charge{live.length === 1 ? "" : "s"} — found in your imported history.
            </Typography>

            <Stack spacing={0.75}>
                {shown.map((item) => {
                    const rise = recentPriceRise(item, now);
                    const isMissing = item.status === "missing";
                    return (
                        <Box
                            key={item.key}
                            onClick={() => onViewItems(item)}
                            sx={{
                                ...xbCardSx,
                                cursor: "pointer",
                                "&:hover": { bgcolor: (theme) => theme.palette.action.hover },
                            }}
                        >
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Box sx={{
                                    width: 28, height: 28, borderRadius: 1, flexShrink: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    bgcolor: (theme) => alpha(
                                        isMissing ? theme.palette.warning.main : theme.palette.text.primary,
                                        0.12,
                                    ),
                                }}>
                                    {isMissing
                                        ? <ErrorOutlineIcon sx={{ fontSize: 15 }} color="warning" />
                                        : <AutorenewIcon sx={{ fontSize: 15 }} />}
                                </Box>

                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                                            {item.merchant}
                                        </Typography>
                                        {rise && (
                                            <Tooltip
                                                title={`Went from ${formatCurrency(rise.from, currency)} to ${formatCurrency(rise.to, currency)}`}
                                            >
                                                <Chip
                                                    size="small"
                                                    color="warning"
                                                    variant="outlined"
                                                    icon={<ArrowUpwardIcon sx={{ fontSize: 11 }} />}
                                                    label={formatCurrency(rise.to - rise.from, currency)}
                                                    sx={{ height: 18, flexShrink: 0, "& .MuiChip-label": { px: 0.5, fontSize: 10 } }}
                                                />
                                            </Tooltip>
                                        )}
                                    </Stack>
                                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {formatCurrency(item.amount, currency)} {cadenceLabel(item.frequency)}
                                            {" · "}
                                            {isMissing ? "was due " : "next "}
                                            {new Date(item.next_expected).toLocaleDateString(undefined, {
                                                month: "short", day: "numeric", timeZone: "UTC",
                                            })}
                                        </Typography>
                                        {item.categories[0] && (
                                            <CategoryChip
                                                name={item.categories[0]}
                                                registry={categoryRegistry}
                                                sx={{ flexShrink: 0 }}
                                            />
                                        )}
                                    </Stack>
                                </Box>

                                <Box sx={{ flexShrink: 0, textAlign: "right" }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                        {formatCurrency(item.monthly_equivalent, currency)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        /mo
                                    </Typography>
                                </Box>

                                <RuleCoverageAction
                                    merchant={item.merchant}
                                    coverage={item.rule_coverage}
                                    rules={rules}
                                    onMakeRule={() => onMakeRule(item)}
                                    onOpenRule={onOpenRule}
                                />
                            </Stack>
                        </Box>
                    );
                })}
            </Stack>

            {live.length > COLLAPSED_ROWS && (
                <Button size="small" onClick={() => setExpanded((v) => !v)} sx={{ mt: 1 }}>
                    {expanded ? "Show less" : `Show all ${live.length}`}
                </Button>
            )}
        </Card>
    );
}
