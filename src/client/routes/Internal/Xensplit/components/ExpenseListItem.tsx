import { Box, Typography, Avatar, alpha, Chip } from "@mui/material";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import type { XenSplitExpense } from "../../../../hooks/xensplit/types";
import { formatCurrency } from "../../../../utils/currencyUtils";
import { getCategoryIcon, getCategoryColor } from "../../../../constants/xensplitCategoryIcons";
import { xsCardSx, xsBadgeSx } from "./rowStyles";

interface ExpenseListItemProps {
    expense: XenSplitExpense;
    onClick: () => void;
    userId?: string;
    /** Hide the inline date in the subtitle (e.g. when the feed is already grouped by date). */
    hideDate?: boolean;
}

export default function ExpenseListItem({ expense, onClick, userId, hideDate }: ExpenseListItemProps) {
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
                        label="Not Simplified"
                        size="small"
                        color="info"
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
