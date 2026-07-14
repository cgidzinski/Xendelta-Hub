import { Box, Typography, Avatar, alpha, Chip } from "@mui/material";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import RepeatIcon from "@mui/icons-material/Repeat";
import type { XenSplitExpense, XenSplitRecurringSeries } from "../../../../hooks/xensplit/types";
import { formatCurrency } from "../../../../utils/currencyUtils";
import { getCategoryIcon, getCategoryColor } from "../../../../constants/xensplitCategoryIcons";
import { xsCardSx, xsBadgeSx } from "./rowStyles";

export const FREQUENCY_LABELS: Record<XenSplitRecurringSeries["frequency"], string> = {
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
};

/** Retired by its own bounds (end date / max occurrences), as opposed to manually paused. */
export function isSeriesEnded(series: XenSplitRecurringSeries): boolean {
    return !series.active && (
        (!!series.end_date && new Date(series.next_run_at) > new Date(series.end_date)) ||
        (!!series.max_occurrences && series.occurrence_count >= series.max_occurrences)
    );
}

export function recurringSeriesCaption(series: XenSplitRecurringSeries): string {
    const freq = FREQUENCY_LABELS[series.frequency];
    if (!series.active) {
        return `${freq} · ${isSeriesEnded(series) ? "Ended" : "Paused"}`;
    }
    const next = new Date(series.next_run_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${freq} · next ${next}`;
}

/**
 * Ids of each ended series' last expense (genesis or occurrence). Derived, not
 * stored — extending an ended series makes it active again and the marker
 * disappears on its own.
 */
export function computeFinalExpenseIds(
    expenses: XenSplitExpense[],
    seriesList: XenSplitRecurringSeries[] | undefined
): Set<string> {
    const ids = new Set<string>();
    for (const s of seriesList ?? []) {
        if (!s.genesis_expense_id || !isSeriesEnded(s)) continue;
        let latest: XenSplitExpense | undefined;
        for (const e of expenses) {
            if (e._id === s.genesis_expense_id || e.recurring_id === s.genesis_expense_id) {
                if (!latest || new Date(e.date) > new Date(latest.date)) latest = e;
            }
        }
        if (latest) ids.add(latest._id);
    }
    return ids;
}

interface ExpenseListItemProps {
    expense: XenSplitExpense;
    onClick: () => void;
    userId?: string;
    /** Hide the inline date in the subtitle (e.g. when the feed is already grouped by date). */
    hideDate?: boolean;
    /** The recurring series this expense is the genesis of, if any. */
    recurringSeries?: XenSplitRecurringSeries;
    /** Last expense of an ended series (see computeFinalExpenseIds). */
    isFinal?: boolean;
}

export default function ExpenseListItem({ expense, onClick, userId, hideDate, recurringSeries, isFinal }: ExpenseListItemProps) {
    const mySplit = userId ? expense.splits.find((sp) => sp.user_id === userId) : undefined;
    const isPayer = userId ? expense.paid_by === userId : false;
    const owe = mySplit && !isPayer && !expense.on_hold
        ? (mySplit.amount_owed ?? (expense.splits.length ? expense.amount / expense.splits.length : 0))
        : 0;
    const dateStr = new Date(expense.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const CategoryIcon = getCategoryIcon(expense.category);
    const categoryColor = getCategoryColor(expense.category);

    return (
        <Box
            onClick={onClick}
            sx={{
                ...xsCardSx,
                display: "grid",
                gridTemplateColumns: "40px 1fr auto",
                alignItems: "flex-start",
                columnGap: 1.25,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
            }}
        >
            <Avatar
                sx={{
                    ...xsBadgeSx,
                    bgcolor: alpha(categoryColor, 0.15),
                    lineHeight: 1,
                }}
            >
                <CategoryIcon sx={{ fontSize: 22, color: categoryColor }} />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{expense.title}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    <Box component="span" sx={{ textTransform: "capitalize" }}>{expense.payer?.username ?? "?"}</Box>
                    {" paid · "}
                    <Box component="span" sx={{ textTransform: "capitalize" }}>{expense.split_type}</Box>
                    {!hideDate ? ` · ${dateStr}` : ""}
                </Typography>
                {expense.on_hold && (
                    <Chip
                        icon={<PauseCircleOutlineIcon sx={{ fontSize: "14px !important" }} />}
                        label="On Hold"
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.6rem", mt: 0.25, "& .MuiChip-label": { px: 0.75 } }}
                    />
                )}
                {expense.do_not_simplify && (
                    <Chip
                        icon={<LinkOffIcon sx={{ fontSize: "14px !important" }} />}
                        label="Direct"
                        size="small"
                        color="info"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.6rem", mt: 0.25, "& .MuiChip-label": { px: 0.75 } }}
                    />
                )}
                {recurringSeries && (
                    <Chip
                        icon={<RepeatIcon sx={{ fontSize: "14px !important" }} />}
                        label={isFinal ? `${recurringSeriesCaption(recurringSeries)} · Final` : recurringSeriesCaption(recurringSeries)}
                        size="small"
                        color="secondary"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.6rem", mt: 0.25, "& .MuiChip-label": { px: 0.75 } }}
                    />
                )}
                {!recurringSeries && expense.recurring_id && (
                    <Chip
                        icon={<RepeatIcon sx={{ fontSize: "14px !important" }} />}
                        label={isFinal ? "Recurring · Final" : "Recurring"}
                        size="small"
                        color="secondary"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.6rem", mt: 0.25, "& .MuiChip-label": { px: 0.75 } }}
                    />
                )}
            </Box>
            <Box sx={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isPayer ? "error.main" : "text.primary", lineHeight: 1.3 }}>
                    {formatCurrency(expense.amount, expense.currency)}
                </Typography>
                {owe > 0 && (
                    <Typography variant="caption" sx={{ color: "error.main", fontWeight: 600, display: "block", lineHeight: 1.2 }}>
                        {formatCurrency(owe, expense.currency)}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}
