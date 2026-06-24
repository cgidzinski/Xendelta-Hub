import { Box, Typography, Avatar } from "@mui/material";
import type { XenSplitExpense } from "../../../../hooks/xensplit/types";
import { formatCurrency } from "../../../../utils/currencyUtils";

interface ExpenseListItemProps {
    expense: XenSplitExpense;
    onClick: () => void;
    userId?: string;
    mb?: number;
}

export default function ExpenseListItem({ expense, onClick, userId, mb }: ExpenseListItemProps) {
    const isInvolved = userId
        ? expense.paid_by === userId || expense.splits.some((sp) => sp.user_id === userId)
        : false;

    return (
        <Box
            onClick={onClick}
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "34px 1fr auto", sm: "40px 1fr auto" },
                alignItems: "center",
                columnGap: 1.5,
                px: 2,
                py: 1.5,
                bgcolor: "action.hover",
                borderRadius: 2,
                cursor: "pointer",
                borderLeft: "3px solid",
                borderColor: isInvolved ? "primary.main" : "transparent",
                mb: mb ?? 0,
                "&:hover": { bgcolor: "action.selected" },
            }}
        >
            <Avatar
                src={expense.payer?.avatar || undefined}
                sx={{ width: { xs: 34, sm: 40 }, height: { xs: 34, sm: 40 } }}
            >
                {expense.payer?.username?.[0]?.toUpperCase() ?? "?"}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {expense.title}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25, flexWrap: "nowrap", minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" noWrap>
                        by{" "}
                        <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
                            {expense.payer?.username ?? "?"}
                        </Box>
                    </Typography>
                    <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "text.disabled", flexShrink: 0 }} />
                    <Typography variant="caption" color="text.secondary" noWrap>
                        {new Date(expense.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </Typography>
                    <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 0.75 }}>
                        <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "text.disabled", flexShrink: 0 }} />
                        <Typography variant="caption" color="text.secondary">
                            {new Date(expense.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </Typography>
                    </Box>
                </Box>
            </Box>
            <Box sx={{ textAlign: "right" }}>
                <Typography variant="subtitle2" color="success.main" sx={{ fontWeight: 700 }}>
                    {formatCurrency(expense.amount, expense.currency)}
                </Typography>
                <Typography variant="caption" sx={{ textTransform: "capitalize", bgcolor: "action.selected", borderRadius: 1, px: 0.75, py: 0.2, fontSize: "0.65rem", fontWeight: 600, color: "text.secondary", display: "inline-block" }}>
                    {expense.split_type}
                </Typography>
            </Box>
        </Box>
    );
}
