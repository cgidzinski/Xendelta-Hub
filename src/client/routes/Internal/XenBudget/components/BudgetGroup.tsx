import { Avatar, Box, Stack, Typography } from "@mui/material";
import type { XenBudgetLabel, XenBudgetMember } from "../../../../hooks/xenbudget/types";
import BudgetProgressBar from "./BudgetProgressBar";
import { CategoryChip } from "./LabelChip";
import type { BudgetGroup } from "./groupBudgets";

interface BudgetGroupProps {
    group: BudgetGroup;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    members: XenBudgetMember[];
    onClick?: () => void;
}

/**
 * One heading (category chips, person, or "Everything") over the budgets that share that
 * scope, each drawn as its own line and progress bar.
 */
export default function BudgetGroup({ group, currency, categoryRegistry, members, onClick }: BudgetGroupProps) {
    const person = group.personId ? members.find((m) => m.user_id === group.personId) : undefined;
    const everything = group.categories.length === 0 && !group.personName;

    return (
        <Box>
            <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" sx={{ minWidth: 0, rowGap: 0.5 }}>
                {group.categories.map((c) => <CategoryChip key={c} name={c} registry={categoryRegistry} />)}
                {group.personName && (
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        {person && (
                            <Avatar src={person.avatar || undefined} sx={{ width: 18, height: 18, fontSize: 10 }}>
                                {person.username[0]?.toUpperCase()}
                            </Avatar>
                        )}
                        <Typography variant="body2" noWrap>{person?.username || group.personName}</Typography>
                    </Stack>
                )}
                {everything && <Typography variant="body2" color="text.secondary">Everything</Typography>}
            </Stack>
            <Stack spacing={1.5} sx={{ mt: 0.75 }}>
                {group.budgets.map((budget) => (
                    <BudgetProgressBar
                        key={budget._id}
                        budget={budget}
                        currency={currency}
                        categoryRegistry={categoryRegistry}
                        members={members}
                        showLabel={false}
                        showPeriod={false}
                        onClick={onClick}
                    />
                ))}
            </Stack>
        </Box>
    );
}
