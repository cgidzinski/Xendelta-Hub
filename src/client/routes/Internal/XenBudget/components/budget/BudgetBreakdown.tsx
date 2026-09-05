import { Box, LinearProgress, Stack, Typography, alpha } from "@mui/material";
import type { BudgetStatus, XenBudgetMember } from "../../../../../hooks/xenbudget/types";
import { formatCurrency } from "../../currency";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { memberColor } from "./budgetColors";
import { directionOf } from "./budgetKind";
import BudgetTarget from "./BudgetTarget";

interface BudgetBreakdownProps {
    budget: BudgetStatus;
    currency: string;
    members: XenBudgetMember[];
    /** Override for the whole-period section; defaults to the range breakdown. */
    byPerson?: BudgetStatus["by_person"];
    /** The spend the breakdown shares are a fraction of; defaults to `budget.spent`. */
    spent?: number;
}

/**
 * Who a shared limit's spend actually went to, and what categories it covers. Scoped to
 * the whole budget - there's no per-person version of "who spent it".
 */
export default function BudgetBreakdown({
    budget, currency, members, byPerson, spent: spentOverride,
}: BudgetBreakdownProps) {
    const money = (v: number) => formatCurrency(v, currency);
    const people = byPerson ?? budget.by_person;
    const spentTotal = spentOverride ?? budget.spent;
    const breakdown = people.filter((p) => p.amount > 0);

    if (breakdown.length === 0 && budget.categories.length <= 1) return null;

    return (
        <Stack spacing={1.25} sx={{ pt: 1.25 }}>
            {breakdown.length > 0 && (
                <Box sx={{ ...cardSx, p: 1.25 }}>
                    <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                        {directionOf(budget.measures) === "floor" ? "Who put it in" : "Who spent it"}
                    </Typography>
                    <Stack spacing={1}>
                        {breakdown.map((person) => {
                            const share = spentTotal > 0 ? (person.amount / spentTotal) * 100 : 0;
                            return (
                                <Box key={person.user_id}>
                                    <Stack
                                        direction="row" alignItems="center" spacing={1}
                                        sx={{ mb: 0.375, minWidth: 0 }}
                                    >
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <BudgetTarget
                                                personId={person.user_id}
                                                personName={person.username}
                                                members={members}
                                                size={18}
                                            />
                                        </Box>
                                        <Typography variant="caption" noWrap sx={{ flexShrink: 0 }}>
                                            {money(person.amount)}
                                        </Typography>
                                        <Typography
                                            variant="caption" color="text.secondary" noWrap
                                            sx={{ flexShrink: 0, minWidth: 32, textAlign: "right" }}
                                        >
                                            {Math.round(share)}%
                                        </Typography>
                                    </Stack>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(100, share)}
                                        sx={{
                                            height: 4, borderRadius: 999,
                                            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
                                            "& .MuiLinearProgress-bar": {
                                                borderRadius: 999,
                                                bgcolor: memberColor(person.user_id, members),
                                            },
                                        }}
                                    />
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>
            )}

            {budget.categories.length > 1 && (
                <Typography variant="caption" color="text.secondary">
                    Covers {budget.categories.join(", ")}.
                </Typography>
            )}
        </Stack>
    );
}
