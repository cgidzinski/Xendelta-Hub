import { useState } from "react";
import {
    Box, ButtonBase, Card, Chip, Collapse, Stack, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type {
    BudgetStatus, SubBudgetStatus, XenBudgetLabel, XenBudgetMember,
} from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { formatCurrency } from "../../../../../utils/currencyUtils";
import BudgetLimitLine from "./BudgetLimitLine";
import BudgetDetails from "./BudgetDetails";
import BudgetTarget from "./BudgetTarget";
import { memberColor, scopeColor } from "./budgetColors";
import { personShare } from "./budgetPersonView";
import { budgetPace } from "./budgetPace";

// Past three, the chips start wrapping to a third line on a phone and stop being a
// glanceable heading. The rest are named in the expanded panel.
const MAX_CHIPS = 3;

const PERIOD_SUFFIX: Record<string, string> = {
    weekly: "weekly", monthly: "monthly", quarterly: "quarterly",
    yearly: "yearly", custom: "one-off",
};

interface BudgetCardProps {
    budget: BudgetStatus;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    members: XenBudgetMember[];
    asOf: string;
    /**
     * Set when the page is narrowed to one member. The caller has already dropped the
     * budgets that don't constrain them and the other people's rows, so all this adds is
     * naming their share of the shared limit - which stays a household figure.
     */
    personId?: string;
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
 */
export default function BudgetCard({
    budget, currency, categoryRegistry, members, asOf, personId, onViewItems, onEdit,
}: BudgetCardProps) {
    // Which limit's details are open, if any: "overall" or a sub-budget id. Only one at a
    // time, so an expanded card stays short enough to read without scrolling past it.
    const [open, setOpen] = useState<string | null>(null);

    const color = scopeColor(budget.categories, categoryRegistry);
    const chips = budget.categories.slice(0, MAX_CHIPS);
    const extra = budget.categories.length - chips.length;
    const suffix = PERIOD_SUFFIX[budget.period] || budget.period;
    const filteredName = personId
        ? members.find((m) => m.user_id === personId)?.username ?? "This person"
        : undefined;
    const pace = budgetPace(budget.period_from, budget.period_to, asOf, budget.spent, budget.amount ?? 0);

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
        </Stack>
    );

    const toggle = (key: string) => setOpen((current) => (current === key ? null : key));

    const detailsFor = (focus: SubBudgetStatus | null) => (
        <BudgetDetails
            budget={budget}
            focus={focus}
            currency={currency}
            members={members}
            asOf={asOf}
            onViewItems={onViewItems ? () => onViewItems(budget) : undefined}
            onEdit={onEdit ? () => onEdit(budget) : undefined}
        />
    );

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.5 }}>
            {/* The shared limit, when there is one. A budget can cap only named people,
            and then the categories are just a heading over their bars. */}
            <ButtonBase
                onClick={() => toggle("overall")}
                aria-expanded={open === "overall"}
                sx={{
                    width: "100%", display: "block", textAlign: "left",
                    minHeight: 44, borderRadius: 1,
                }}
            >
                <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        {budget.amount === undefined ? (
                            <Stack
                                direction="row" alignItems="center" spacing={1}
                                sx={{ minWidth: 0 }}
                            >
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>{heading}</Box>
                                <Typography
                                    variant="caption" color="text.secondary" noWrap
                                    sx={{ flexShrink: 0 }}
                                >
                                    {formatCurrency(budget.spent, currency)} · {suffix}
                                </Typography>
                            </Stack>
                        ) : (
                            <BudgetLimitLine
                                label={heading}
                                amount={budget.amount}
                                spent={budget.spent}
                                percent={budget.percent ?? 0}
                                over={budget.over ?? false}
                                currency={currency}
                                color={color}
                                height={8}
                                pace={pace.elapsed}
                                suffix={suffix}
                                barLabel={`${budget.categories.join(", ") || "Everything"}: ${
                                    formatCurrency(budget.spent, currency)
                                } of ${formatCurrency(budget.amount, currency)}, ${budget.percent ?? 0}% of the limit`}
                            />
                        )}
                        {/* Narrowed to one member: the bar above is still the household
                        total, so their own contribution to it is named rather than
                        substituted for it. */}
                        {personId && budget.amount !== undefined && (
                            <Typography
                                variant="caption" color="text.secondary"
                                sx={{ display: "block", mt: 0.25 }}
                            >
                                {filteredName}: {formatCurrency(personShare(budget, personId), currency)} of this
                            </Typography>
                        )}
                    </Box>
                    <ExpandMoreIcon
                        fontSize="small"
                        sx={{
                            color: "text.disabled", flexShrink: 0, mt: 0.25,
                            transform: open === "overall" ? "rotate(180deg)" : "none",
                            transition: "transform 150ms",
                        }}
                    />
                </Stack>
            </ButtonBase>

            <Collapse in={open === "overall"} unmountOnExit>
                {detailsFor(null)}
            </Collapse>

            {budget.sub_budgets.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                        {budget.amount === undefined ? "Per-person limits" : "Personal limits"}
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
                                        currency={currency}
                                        color={memberColor(sub.person_id, members)}
                                        height={6}
                                        pace={pace.elapsed}
                                        barLabel={`${sub.person_name}: ${
                                            formatCurrency(sub.spent, currency)
                                        } of ${formatCurrency(sub.amount, currency)}, ${sub.percent}% of their limit`}
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
        </Card>
    );
}
