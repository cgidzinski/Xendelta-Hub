import { Box, LinearProgress, Stack, Typography, alpha } from "@mui/material";
import type { BudgetStatus, XenBudgetLabel } from "../../../../hooks/xenbudget/types";
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
    onClick?: () => void;
}

export default function BudgetProgressBar({ budget, currency, categoryRegistry, onClick }: BudgetProgressBarProps) {
    const label = budget.scope === "category"
        ? budget.category
        : budget.scope === "person"
            ? budget.person_name
            : "Everything";

    // The bar is clamped so it can't overflow its track, but the caption reports the real
    // figure — a budget at 260% has to read as 260%, not as a full bar like one at 100%.
    const barValue = Math.min(budget.percent, 100);
    const barColor = budget.over ? "error.main" : budget.percent >= 80 ? "warning.main" : undefined;

    return (
        <Box onClick={onClick} sx={{ cursor: onClick ? "pointer" : "default" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                {budget.scope === "category" && budget.category
                    ? <CategoryChip name={budget.category} registry={categoryRegistry} />
                    : <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>{label}</Typography>}
                <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }} noWrap>
                    {PERIOD_LABELS[budget.period] || "this period"}
                </Typography>
                <Typography variant="body2" sx={{ color: budget.over ? "error.main" : "text.primary" }}>
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
                            : budget.scope === "category" && budget.category
                                ? { bgcolor: resolveLabelColor(budget.category, categoryRegistry) }
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
