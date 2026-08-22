import { Avatar, Box, LinearProgress, Stack, Typography, alpha } from "@mui/material";
import type { BudgetStatus, XenBudgetLabel, XenBudgetMember } from "../../../../hooks/xenbudget/types";
import { CategoryChip, resolveLabelColor } from "./LabelChip";
import { formatCurrency } from "../../../../utils/currencyUtils";

const PERIOD_LABELS: Record<string, string> = {
    weekly: "this week",
    monthly: "this month",
    quarterly: "this quarter",
    yearly: "this year",
    custom: "this period",
};

interface BudgetProgressBarProps {
    budget: BudgetStatus;
    currency: string;
    categoryRegistry: XenBudgetLabel[];
    members: XenBudgetMember[];
    onClick?: () => void;
}

export default function BudgetProgressBar({ budget, currency, categoryRegistry, members, onClick }: BudgetProgressBarProps) {
    const categories = budget.categories || [];
    const person = budget.person_id ? members.find((m) => m.user_id === budget.person_id) : undefined;
    const everything = categories.length === 0 && !budget.person_name;

    // The bar is clamped so it can't overflow its track, but the caption reports the real
    // figure — a budget at 260% has to read as 260%, not as a full bar like one at 100%.
    const barValue = Math.min(budget.percent, 100);
    const barColor = budget.over ? "error.main" : budget.percent >= 80 ? "warning.main" : undefined;
    // Only one category has a single colour to tint the bar with — more than one, or none
    // at all, falls back to the default track colour.
    const soleCategoryColor = categories.length === 1 ? resolveLabelColor(categories[0], categoryRegistry) : undefined;

    return (
        <Box onClick={onClick} sx={{ cursor: onClick ? "pointer" : "default" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" sx={{ minWidth: 0, rowGap: 0.5 }}>
                    {categories.map((c) => <CategoryChip key={c} name={c} registry={categoryRegistry} />)}
                    {budget.person_name && (
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            {person && (
                                <Avatar src={person.avatar || undefined} sx={{ width: 18, height: 18, fontSize: 10 }}>
                                    {person.username[0]?.toUpperCase()}
                                </Avatar>
                            )}
                            <Typography variant="body2" noWrap>{person?.username || budget.person_name}</Typography>
                        </Stack>
                    )}
                    {everything && <Typography variant="body2" color="text.secondary">Everything</Typography>}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }} noWrap>
                    {PERIOD_LABELS[budget.period] || "this period"}
                </Typography>
                <Typography
                    variant="body2" noWrap
                    sx={{ color: budget.over ? "error.main" : "text.primary", flexShrink: 0 }}
                >
                    {formatCurrency(budget.spent, currency)}
                    <Typography component="span" variant="body2" color="text.secondary">
                        {" / "}{formatCurrency(budget.amount, currency)}
                    </Typography>
                </Typography>
            </Stack>
            <LinearProgress
                variant="determinate"
                value={barValue}
                sx={{
                    height: 6,
                    borderRadius: 1,
                    bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
                    "& .MuiLinearProgress-bar": {
                        borderRadius: 1,
                        ...(barColor
                            ? { bgcolor: barColor }
                            : soleCategoryColor
                                ? { bgcolor: soleCategoryColor }
                                : {}),
                    },
                }}
            />
            <Typography
                variant="caption"
                color={budget.over ? "error.main" : "text.secondary"}
                sx={{ display: "block", mt: 0.25 }}
            >
                {budget.over
                    ? `${formatCurrency(-budget.remaining, currency)} over — ${budget.percent}%`
                    : `${formatCurrency(budget.remaining, currency)} left — ${budget.percent}%`}
            </Typography>
        </Box>
    );
}
