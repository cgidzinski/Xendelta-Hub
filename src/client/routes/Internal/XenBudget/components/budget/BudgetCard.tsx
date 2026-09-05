import { useState } from "react";
import {
    Box, ButtonBase, Card, Chip, Collapse, Divider, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PublicIcon from "@mui/icons-material/Public";
import PersonIcon from "@mui/icons-material/Person";
import type {
    BudgetStatus, SubBudgetStatus, XenBudgetLabel, XenBudgetMember,
} from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { formatCurrency } from "../../currency";
import BudgetLimitLine from "./BudgetLimitLine";
import BudgetDetails from "./BudgetDetails";
import BudgetTarget from "./BudgetTarget";
import { memberColor, scopeColor } from "./budgetColors";
import { directionOf, limitNoun, periodLabel as periodWord } from "./budgetKind";
import { budgetPace } from "./budgetPace";

// Past three, the chips start wrapping to a third line on a phone and stop being a
// glanceable heading. The rest are named in the expanded panel.
const MAX_CHIPS = 3;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface BudgetCardProps {
    budget: BudgetStatus;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    members: XenBudgetMember[];
    asOf: string;
    /**
     * Names the window the figures cover, for when they've been restated for a report
     * range rather than measured over the budget's own period.
     */
    periodLabel?: string;
    onViewItems?: (budget: BudgetStatus) => void;
}

/**
 * One budget: its shared limit as the headline, and the per-person limits nested under it
 * as their own bars.
 *
 * The nesting is the point. A household grocery cap and Alice's cap inside it are the
 * same budget over the same items and the same dates, so they belong in one card where
 * the two bars can be read against each other - not as two rows that merely sort next to
 * each other and might not even cover the same window.
 *
 * In the `minimal` variant the card starts collapsed to just the overarching budget and
 * reveals the per-person limits (and the overall detail panel) on click.
 */
export default function BudgetCard({
    budget, currency, categoryRegistry, members, asOf, periodLabel,
    onViewItems,
}: BudgetCardProps) {
    // One click expands both the selected-range and whole-period sections at once.
    const [open, setOpen] = useState(false);
    // Which person's limit is expanded, if any.
    const [openSub, setOpenSub] = useState<string | null>(null);
    const hasOverall = budget.amount !== undefined;

    const color = scopeColor(budget.categories, categoryRegistry);
    const chips = budget.categories.slice(0, MAX_CHIPS);
    const extra = budget.categories.length - chips.length;
    const hasPersonLimits = budget.sub_budgets.length > 0;
    const pace = budgetPace(budget.period_from, budget.period_to, asOf, budget.spent, budget.amount ?? 0);
    // A budget with no overarching amount is read as the sum of its per-person limits, so
    // the headline still shows one normal bar instead of an orphaned category heading.
    const summedAmount = budget.sub_budgets.reduce((sum, s) => sum + s.amount, 0);
    const summedSpent = budget.sub_budgets.reduce((sum, s) => sum + s.spent, 0);
    const headlineAmount = hasOverall ? (budget.amount ?? 0) : summedAmount;
    const headlineSpent = hasOverall ? budget.spent : summedSpent;
    const headlinePercent = hasOverall
        ? (budget.percent ?? 0)
        : headlineAmount > 0 ? Math.round((headlineSpent / headlineAmount) * 100) : 0;
    const headlineOver = hasOverall ? (budget.over ?? false) : headlineSpent > headlineAmount;
    // The whole-period figures, for the second bar shown only when the budget's own period
    // is longer than the selected range (so the whole-period total is the larger number).
    const periodAmount = budget.period_amount;
    const periodSpent = budget.period_spent ?? 0;
    const periodPercent = periodAmount !== undefined && periodAmount > 0
        ? Math.round((periodSpent / periodAmount) * 100) : 0;
    const periodOver = periodAmount !== undefined && periodSpent > periodAmount;
    const showWholePeriod = periodAmount !== undefined && periodAmount > headlineAmount;

    const heading = (
        <Stack
            direction="row" alignItems="center"
            sx={{ flexWrap: "wrap", gap: 0.5, minWidth: 0 }}
        >
            {budget.categories.length === 0
                ? <Typography variant="body2" color="text.secondary">Everything</Typography>
                : chips.map((c) => <CategoryChip key={c} name={c} registry={categoryRegistry} />)}
            {extra > 0 && (
                <Chip size="small" label={`+${extra}`} sx={{ height: 20, fontSize: 11 }} />
            )}
            {/* The word, not an initial. "M" only ever meant "monthly" via a hover
            tooltip, which is nothing at all on a touch screen. */}
            <Chip
                size="small"
                label={capitalize(periodWord(budget.period))}
                sx={{ height: 20, fontSize: 11 }}
            />
            {hasOverall && (
                <Tooltip title="Shared limit">
                    <PublicIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                </Tooltip>
            )}
            {hasPersonLimits && (
                <Tooltip title="Per-person limits">
                    <PersonIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                </Tooltip>
            )}
        </Stack>
    );

    const detailsFor = (focus: SubBudgetStatus | null, section?: "range" | "whole") => (
        <BudgetDetails
            budget={budget}
            focus={focus}
            section={section}
            currency={currency}
            asOf={asOf}
            periodLabel={periodLabel}
            members={members}
        />
    );

    const chevron = (expanded: boolean) => (
        <ExpandMoreIcon
            fontSize="small"
            sx={{
                color: "text.disabled", flexShrink: 0,
                transform: expanded ? "rotate(180deg)" : "none",
                transition: "transform 150ms",
            }}
        />
    );

    return (
        <Card
            variant="outlined"
            sx={{ ...cardSx, p: 1.5, borderWidth: 4, ...(open ? { cursor: "pointer" } : {}) }}
            onClick={() => { if (open) setOpen(false); }}
        >
            {/* One click expands both periods, each with its detail under its own bar. */}
            <ButtonBase
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                sx={{
                    width: "100%", display: "block", textAlign: "left",
                    minHeight: 44, borderRadius: 1,
                }}
            >
                <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" sx={{ minWidth: 0 }}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>{heading}</Box>
                        {chevron(open)}
                    </Stack>

                    <BudgetLimitLine
                        label={(
                            <Typography variant="caption" color="text.secondary">
                                {periodLabel ?? capitalize(periodWord(budget.period))}
                            </Typography>
                        )}
                        amount={headlineAmount}
                        spent={headlineSpent}
                        percent={headlinePercent}
                        over={headlineOver}
                        direction={directionOf(budget.measures)}
                        currency={currency}
                        color={color}
                        height={8}
                        pace={pace.elapsed}
                        itemCount={budget.item_count}
                        barLabel={`${budget.categories.join(", ") || "Everything"}: ${formatCurrency(headlineSpent, currency)
                            } of ${formatCurrency(headlineAmount, currency)}, ${headlinePercent}% of the ${limitNoun(directionOf(budget.measures))}`}
                    />
                </Stack>
            </ButtonBase>

            <Collapse in={open} unmountOnExit>
                {detailsFor(null, "range")}
            </Collapse>

            {showWholePeriod && periodAmount !== undefined && (
                <>
                    <Divider sx={{ my: 0.25, ml: 0.5 }} />
                    <ButtonBase
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        sx={{
                            width: "100%", display: "block", textAlign: "left",
                            minHeight: 44, borderRadius: 1,
                        }}
                    >
                        <BudgetLimitLine
                            label={(
                                <Typography variant="caption" color="text.secondary">
                                    {capitalize(periodWord(budget.period))}
                                </Typography>
                            )}
                            amount={periodAmount}
                            spent={periodSpent}
                            percent={periodPercent}
                            over={periodOver}
                            direction={directionOf(budget.measures)}
                            currency={currency}
                            color={color}
                            height={6}
                            itemCount={budget.period_item_count}
                            barLabel={`${capitalize(periodWord(budget.period))}: ${formatCurrency(periodSpent, currency)
                                } of ${formatCurrency(periodAmount, currency)}, ${periodPercent}% of the ${limitNoun(directionOf(budget.measures))}`}
                        />
                    </ButtonBase>
                    <Collapse in={open} unmountOnExit>
                        {detailsFor(null, "whole")}
                    </Collapse>
                </>
            )}

            {budget.sub_budgets.length > 0 && (
                <Box sx={{ ...cardSx, mt: 1.5, p: 1.25 }}>
                    <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                        {budget.measures === "income"
                            ? (budget.amount === undefined ? "Per-person targets" : "Per-person sub targets")
                            : (budget.amount === undefined ? "Per-person limits" : "Per-person sub limits")}
                    </Typography>
                    <Stack spacing={1.25}>
                        {budget.sub_budgets.map((sub) => (
                            <Box key={sub._id}>
                                <ButtonBase
                                    onClick={(e) => { e.stopPropagation(); setOpenSub((c) => (c === sub._id ? null : sub._id)); }}
                                    aria-expanded={openSub === sub._id}
                                    sx={{
                                        width: "100%", display: "block", textAlign: "left",
                                        minHeight: 44, borderRadius: 1,
                                    }}
                                >
                                    <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <BudgetLimitLine
                                                label={(
                                                    <BudgetTarget
                                                        personId={sub.person_id}
                                                        personName={sub.person_name}
                                                        members={members}
                                                    />
                                                )}
                                                amount={sub.amount}
                                                spent={sub.spent}
                                                percent={sub.percent}
                                                over={sub.over}
                                                direction={directionOf(budget.measures)}
                                                currency={currency}
                                                color={memberColor(sub.person_id, members)}
                                                height={6}
                                                pace={pace.elapsed}
                                                itemCount={sub.item_count}
                                                barLabel={`${sub.person_name}: ${formatCurrency(sub.spent, currency)
                                                    } of ${formatCurrency(sub.amount, currency)}, ${sub.percent}% of their ${limitNoun(directionOf(budget.measures))}`}
                                            />
                                        </Box>
                                        {chevron(openSub === sub._id)}
                                    </Stack>
                                </ButtonBase>
                                <Collapse in={openSub === sub._id} unmountOnExit>
                                    {detailsFor(sub)}
                                </Collapse>
                            </Box>
                        ))}
                    </Stack>
                </Box>
            )}

            {open && onViewItems && (
                <Stack direction="row" justifyContent="flex-end" spacing={0.5} sx={{ pt: 1 }}>
                    <Tooltip title="View items">
                        <IconButton
                            size="small"
                            aria-label="View items"
                            onClick={(e) => { e.stopPropagation(); onViewItems(budget); }}
                        >
                            <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )}
        </Card>
    );
}
