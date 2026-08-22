import { Box, Card, Chip, IconButton, Stack, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type {
    BudgetStatus, XenBudgetLabel, XenBudgetMember,
} from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import { cardSx } from "../../../../../components/ui/surfaceStyles";
import { formatCurrency } from "../../../../../utils/currencyUtils";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";
import BudgetLimitLine from "./BudgetLimitLine";
import BudgetTarget from "./BudgetTarget";
import { memberColor, scopeColor } from "./budgetColors";
import { limitNoun } from "./budgetKind";

const PERIOD_SUFFIX: Record<string, string> = {
    weekly: "weekly", monthly: "monthly", quarterly: "quarterly",
    yearly: "yearly", custom: "one-off",
};

interface BudgetRowProps {
    budget: BudgetStatus;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    members: XenBudgetMember[];
    onEdit: () => void;
}

/**
 * One budget on the management page.
 *
 * Deliberately not the collapsible card the overview uses: here every budget is its own
 * editable thing, so each gets a card of its own with one obvious action rather than a
 * disclosure that competes with it. Nothing expands - the whole card opens the form.
 */
export default function BudgetRow({
    budget, currency, categoryRegistry, members, onEdit,
}: BudgetRowProps) {
    const color = scopeColor(budget.categories, categoryRegistry);
    const suffix = PERIOD_SUFFIX[budget.period] || budget.period;

    return (
        <Card
            variant="outlined"
            onClick={onEdit}
            sx={{ ...cardSx, p: 1.5, cursor: "pointer", "&:hover": { borderColor: "text.disabled" } }}
        >
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1, minWidth: 0 }}>
                <Stack
                    direction="row" alignItems="center"
                    sx={{ flexWrap: "wrap", gap: 0.5, flexGrow: 1, minWidth: 0 }}
                >
                    {budget.categories.length === 0
                        ? <Typography variant="body2" color="text.secondary">Everything</Typography>
                        : budget.categories.map((c) => (
                            <CategoryChip key={c} name={c} registry={categoryRegistry} />
                        ))}
                    <Chip size="small" label={suffix} sx={{ height: 20, fontSize: 11 }} />
                    {budget.kind === "goal" && (
                        <Chip
                            size="small" label="Savings goal"
                            sx={{ height: 20, fontSize: 11, color: INCOME_COLOR, borderColor: INCOME_COLOR }}
                            variant="outlined"
                        />
                    )}
                </Stack>
                <IconButton
                    size="small"
                    aria-label="Edit budget"
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    sx={{ flexShrink: 0 }}
                >
                    <EditIcon fontSize="small" />
                </IconButton>
            </Stack>

            {budget.amount === undefined ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    {budget.kind === "goal"
                        ? `No overall target — ${formatCurrency(budget.spent, currency)} saved this period`
                        : `No overall limit — ${formatCurrency(budget.spent, currency)} spent this period`}
                </Typography>
            ) : (
                <BudgetLimitLine
                    label={<BudgetTarget members={members} />}
                    amount={budget.amount}
                    spent={budget.spent}
                    percent={budget.percent ?? 0}
                    over={budget.over ?? false}
                    kind={budget.kind}
                    currency={currency}
                    color={color}
                    height={6}
                    barLabel={`${budget.categories.join(", ") || "Everything"}: ${
                        formatCurrency(budget.spent, currency)
                    } of ${formatCurrency(budget.amount, currency)}, ${
                        budget.percent ?? 0}% of the ${limitNoun(budget.kind)}`}
                />
            )}

            {budget.sub_budgets.length > 0 && (
                <Stack spacing={1} sx={{ mt: 1.25 }}>
                    {budget.sub_budgets.map((sub) => (
                        <Box key={sub._id}>
                            <BudgetLimitLine
                                label={(
                                    <BudgetTarget
                                        personId={sub.person_id}
                                        personName={sub.person_name}
                                        members={members}
                                        size={18}
                                    />
                                )}
                                amount={sub.amount}
                                spent={sub.spent}
                                percent={sub.percent}
                                over={sub.over}
                                kind={budget.kind}
                                currency={currency}
                                color={memberColor(sub.person_id, members)}
                                height={5}
                                barLabel={`${sub.person_name}: ${
                                    formatCurrency(sub.spent, currency)
                                } of ${formatCurrency(sub.amount, currency)}, ${
                                    sub.percent}% of their ${limitNoun(budget.kind)}`}
                            />
                        </Box>
                    ))}
                </Stack>
            )}
        </Card>
    );
}
