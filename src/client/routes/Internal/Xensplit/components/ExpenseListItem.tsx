import { Box, Typography } from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import type { XenSplitExpense } from "../../../../hooks/xensplit/types";
import { formatCurrency } from "../../../../utils/currencyUtils";
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
    const isInvolved = userId ? expense.paid_by === userId || expense.splits.some((sp) => sp.user_id === userId) : false;
    const owe = mySplit && expense.paid_by !== userId
        ? (mySplit.amount_owed ?? (expense.splits.length ? expense.amount / expense.splits.length : 0))
        : 0;
    const dateStr = new Date(expense.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });

    return (
        <Box
            onClick={onClick}
            sx={{
                ...xsCardSx,
                position: "relative",
                display: "grid",
                gridTemplateColumns: "40px 1fr auto",
                alignItems: "center",
                columnGap: 1.25,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                ...(isInvolved && {
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        left: -2,
                        top: 8,
                        bottom: 8,
                        width: 4,
                        borderRadius: 2,
                        bgcolor: "primary.main",
                    },
                }),
            }}
        >
            <Box sx={{ ...xsBadgeSx, bgcolor: "action.selected" }}>
                <ReceiptLongIcon sx={{ fontSize: 20, color: "text.secondary" }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{expense.title}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    <Box component="span" sx={{ textTransform: "capitalize" }}>{expense.payer?.username ?? "?"}</Box>
                    {" paid · "}
                    <Box component="span" sx={{ textTransform: "capitalize" }}>{expense.split_type}</Box>
                    {!hideDate ? ` · ${dateStr}` : ""}
                </Typography>
            </Box>
            <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary", lineHeight: 1.3 }}>
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
