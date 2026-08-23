import { useState } from "react";
import {
    Box, ButtonBase, Card, Chip, Collapse, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import EditIcon from "@mui/icons-material/Edit";
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
import BudgetBreakdown from "./BudgetBreakdown";
import BudgetTarget from "./BudgetTarget";
import { memberColor, scopeColor } from "./budgetColors";
import { limitNoun } from "./budgetKind";
import { budgetPace } from "./budgetPace";

// Past three, the chips start wrapping to a third line on a phone and stop being a
// glanceable heading. The rest are named in the expanded panel.
const MAX_CHIPS = 3;

interface BudgetCardProps {
    budget: BudgetStatus;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    members: XenBudgetMember[];
    asOf: string;
    /**
     * "full" (default) shows the shared limit and every person's limit all at once;
     * "minimal" collapses to just the overarching budget and reveals the per-person
     * limits when clicked.
     */
    variant?: "full" | "minimal";
    onViewItems?: (budget: BudgetStatus) => void;
    onEdit?: (budget: BudgetStatus) => void;
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
    budget, currency, categoryRegistry, members, asOf, variant = "full", onViewItems, onEdit,
}: BudgetCardProps) {
    // Which limit's details are open, if any: "overall" or a sub-budget id. Only one at a
    // time, so an expanded card stays short enough to read without scrolling past it.
    const [open, setOpen] = useState<string | null>(null);
    // Minimal variant: whether the per-person limits are revealed under the headline.
    const [revealed, setRevealed] = useState(false);
    const isMinimal = variant === "minimal";
    const hasOverall = budget.amount !== undefined;
    const minimalOpen = revealed;

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

    const toggle = (key: string) => setOpen((current) => (current === key ? null : key));

    const detailsFor = (focus: SubBudgetStatus | null) => (
        <BudgetDetails
            budget={budget}
            focus={focus}
            currency={currency}
            asOf={asOf}
        />
    );

    // The pace/projection panel comes first, then the per-person limits in their own
    // grouped box, then who the shared spend actually went to, with the card-level
    // actions sitting at the very bottom.
    const showPersonBudgets = !isMinimal || minimalOpen;
    const showOverallDetails = isMinimal ? minimalOpen : open === "overall";
    const showActions = !isMinimal || minimalOpen;

    const header = (
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <BudgetLimitLine
                    label={heading}
                    amount={headlineAmount}
                    spent={headlineSpent}
                    percent={headlinePercent}
                    over={headlineOver}
                    kind={budget.kind}
                    currency={currency}
                    color={color}
                    height={8}
                    pace={pace.elapsed}
                    itemCount={budget.item_count}
                    barLabel={`${budget.categories.join(", ") || "Everything"}: ${formatCurrency(headlineSpent, currency)
                        } of ${formatCurrency(headlineAmount, currency)}, ${headlinePercent}% of the ${limitNoun(budget.kind)}`}
                />
            </Box>
            <ExpandMoreIcon
                fontSize="small"
                sx={{
                    color: "text.disabled", flexShrink: 0, mt: 0.25,
                    transform: (isMinimal ? revealed : open === "overall") ? "rotate(180deg)" : "none",
                    transition: "transform 150ms",
                }}
            />
        </Stack>
    );

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.5 }}>
            {/* The shared limit, when there is one. A budget can cap only named people,
            and then the categories are just a heading over their bars. */}
            <ButtonBase
                onClick={isMinimal ? () => setRevealed((v) => !v) : () => toggle("overall")}
                aria-expanded={isMinimal ? revealed : open === "overall"}
                sx={{
                    width: "100%", display: "block", textAlign: "left",
                    minHeight: 44, borderRadius: 1,
                }}
            >
                {header}
            </ButtonBase>

            <Collapse in={showOverallDetails} unmountOnExit>
                {detailsFor(null)}
            </Collapse>

            <Collapse in={showPersonBudgets}>
                {budget.sub_budgets.length > 0 && (
                    <Box sx={{ ...cardSx, mt: 1.5, p: 1.25 }}>
                        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                            {budget.kind === "goal"
                                ? (budget.amount === undefined ? "Per-person targets" : "Per-person sub targets")
                                : (budget.amount === undefined ? "Per-person limits" : "Per-person sub limits")}
                        </Typography>
                        <Stack spacing={1.25}>
                            {budget.sub_budgets.map((sub) => (
                                <Box key={sub._id}>
                                    <ButtonBase
                                        onClick={() => toggle(sub._id)}
                                        aria-expanded={open === sub._id}
                                        sx={{
                                            width: "100%", display: "block", textAlign: "left",
                                            minHeight: 44, borderRadius: 1,
                                        }}
                                    >
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
                                            kind={budget.kind}
                                            currency={currency}
                                            color={memberColor(sub.person_id, members)}
                                            height={6}
                                            pace={pace.elapsed}
                                            itemCount={sub.item_count}
                                            barLabel={`${sub.person_name}: ${formatCurrency(sub.spent, currency)
                                                } of ${formatCurrency(sub.amount, currency)}, ${sub.percent}% of their ${limitNoun(budget.kind)}`}
                                        />
                                    </ButtonBase>
                                    <Collapse in={open === sub._id} unmountOnExit>
                                        {detailsFor(sub)}
                                    </Collapse>
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                )}
            </Collapse>

            <Collapse in={showOverallDetails} unmountOnExit>
                <BudgetBreakdown budget={budget} currency={currency} members={members} />
            </Collapse>

            <Collapse in={showActions}>
                {(onViewItems || onEdit) && (
                    <Stack direction="row" justifyContent="flex-end" spacing={0.5} sx={{ pt: 1 }}>
                        {onViewItems && (
                            <Tooltip title="View items">
                                <IconButton size="small" aria-label="View items" onClick={() => onViewItems(budget)}>
                                    <ReceiptLongIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        {onEdit && (
                            <Tooltip title="Edit budget">
                                <IconButton size="small" aria-label="Edit budget" onClick={() => onEdit(budget)}>
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                )}
            </Collapse>
        </Card>
    );
}
