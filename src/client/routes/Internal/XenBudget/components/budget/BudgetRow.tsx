import { Box, Card, Chip, IconButton, Stack, Typography, alpha } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type {
    BudgetStatus, XenBudgetLabel, XenBudgetMember,
} from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import { cardSx } from "../../../../../components/ui/surfaceStyles";
import { formatCurrency } from "../../currency";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";
import BudgetTarget from "./BudgetTarget";
import { periodNoun } from "./periodDisplay";

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
    const noun = periodNoun(budget.period);

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
                    {budget.measures === "income" && (
                        <Chip
                            size="small" label="Income"
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

            {budget.amount !== undefined && (
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <BudgetTarget members={members} fullWidth />
                        </Box>
                        <Typography variant="body2" noWrap sx={{ flexShrink: 0, color: "text.secondary" }}>
                            {formatCurrency(budget.amount, currency)} / {noun}
                        </Typography>
                    </Stack>
                    {budget.weekly_amount !== undefined && budget.monthly_amount !== undefined && budget.quarterly_amount !== undefined && budget.yearly_amount !== undefined && (
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <Chip size="small" label={`${formatCurrency(budget.weekly_amount, currency)}/wk`} sx={{ height: 20, fontSize: 11 }} />
                            <Chip size="small" label={`${formatCurrency(budget.monthly_amount, currency)}/mo`} sx={{ height: 20, fontSize: 11 }} />
                            <Chip size="small" label={`${formatCurrency(budget.quarterly_amount, currency)}/qtr`} sx={{ height: 20, fontSize: 11 }} />
                            <Chip size="small" label={`${formatCurrency(budget.yearly_amount, currency)}/yr`} sx={{ height: 20, fontSize: 11 }} />
                        </Stack>
                    )}
                </Stack>
            )}

            {budget.sub_budgets.length > 0 && (
                <Stack spacing={1} sx={{ mt: 1.25 }}>
                    {budget.sub_budgets.map((sub) => (
                        <Stack
                            key={sub._id}
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            sx={{
                                border: "1px solid",
                                borderColor: (theme) => alpha(theme.palette.divider, 0.5),
                                borderRadius: 1.5,
                                p: 1,
                                minWidth: 0,
                            }}
                        >
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <BudgetTarget
                                    personId={sub.person_id}
                                    personName={sub.person_name}
                                    members={members}
                                    size={18}
                                />
                            </Box>
                            <Typography variant="body2" noWrap sx={{ flexShrink: 0, color: "text.secondary" }}>
                                {formatCurrency(sub.amount, currency)} / {noun}
                            </Typography>
                        </Stack>
                    ))}
                </Stack>
            )}
        </Card>
    );
}
