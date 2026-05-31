import { useOutletContext } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Avatar, Button } from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitExpense, XenSplitSettlement } from "../../../hooks/xensplit/types";
import ExpenseListItem from "./components/ExpenseListItem";

type ActivityItem =
    | { type: "expense"; date: string; expense: XenSplitExpense }
    | { type: "settlement"; date: string; settlement: XenSplitSettlement };

export default function GroupOverview() {
    const { group, balancesData, user, formatCurrency, onViewExpense } = useOutletContext<GroupDetailContext>();
    const navigate = useNavigate();
    const { groupId } = useParams<{ groupId: string }>();

    // User balance per currency
    const userBalance = balancesData?.balances[user.id]?.balances ?? {};
    const nonZeroBalances = Object.entries(userBalance).filter(([, v]) => v !== 0);

    // Group total spend per currency
    const groupTotalsByCurrency: { [currency: string]: number } = {};
    group.expenses.forEach((e) => {
        groupTotalsByCurrency[e.currency] = (groupTotalsByCurrency[e.currency] ?? 0) + e.amount;
    });

    const userPaidCount = group.expenses.filter((e) => e.paid_by === user.id).length;

    // Pending settlements involving this user
    const userSettlements = (balancesData?.settlements ?? []).filter(
        (s) => s.from === user.id || s.to === user.id
    );

    // Activity feed
    const feed: ActivityItem[] = [
        ...group.expenses.map((e) => ({ type: "expense" as const, date: e.date, expense: e })),
        ...group.settlements.map((s) => ({
            type: "settlement" as const,
            date: s.settled_at,
            settlement: s,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);

    return (
        <Box>
            {/* Pending settlements — always visible */}
            <Button
                fullWidth
                variant={userSettlements.length > 0 ? "outlined" : "text"}
                color={userSettlements.length > 0 ? "warning" : "inherit"}
                size="small"
                onClick={() => navigate(`/internal/xensplit/groups/${groupId}/settlements`)}
                sx={{ mb: 2, borderRadius: 2, fontWeight: 600, opacity: userSettlements.length === 0 ? 0.5 : 1 }}
            >
                {userSettlements.length > 0
                    ? `${userSettlements.length} pending settlement${userSettlements.length !== 1 ? "s" : ""}`
                    : "No pending settlements"}
            </Button>

            {/* Summary cards */}
            <Box sx={{ display: "flex", gap: 1.5, mb: 3 }}>
                {/* Expenses */}
                <Box sx={{ flex: 1, bgcolor: "action.hover", borderRadius: 2, p: 2, minWidth: 0 }}>
                    <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.5 }}
                    >
                        Expenses
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                        {group.expenses.length} total
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.75 }}>
                        {userPaidCount} paid by you
                    </Typography>
                </Box>

                {/* Your Balance */}
                <Box sx={{ flex: 1, bgcolor: "action.hover", borderRadius: 2, p: 2, minWidth: 0 }}>
                    <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.5 }}
                    >
                        {nonZeroBalances.length === 0
                            ? "Balance"
                            : (nonZeroBalances[0][1] as number) >= 0
                                ? "You're Owed"
                                : "You Owe"}
                    </Typography>
                    {nonZeroBalances.length > 0 ? (
                        nonZeroBalances.map(([currency, amount]) => (
                            <Typography
                                key={currency}
                                variant="body1"
                                sx={{
                                    fontWeight: 700,
                                    color: (amount as number) >= 0 ? "success.main" : "error.main",
                                    lineHeight: 1.3,
                                }}
                            >
                                {formatCurrency(Math.abs(amount as number), currency)}
                            </Typography>
                        ))
                    ) : (
                        <Typography variant="body1" sx={{ fontWeight: 700, color: "text.disabled" }}>
                            Settled up
                        </Typography>
                    )}
                    <Box sx={{ mt: 0.75 }}>
                        {Object.entries(groupTotalsByCurrency).map(([currency, total]) => (
                            <Typography key={currency} variant="caption" color="text.disabled" sx={{ display: "block" }}>
                                Group: {formatCurrency(total, currency)}
                            </Typography>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* Activity feed */}
            {feed.length > 0 ? (
                <>
                    <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1.5 }}
                    >
                        Activity
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {feed.map((item, idx) => {
                            if (item.type === "expense") {
                                const e = item.expense;
                                return (
                                    <ExpenseListItem
                                        key={`expense-${e._id}`}
                                        expense={e}
                                        onClick={() => onViewExpense(e)}
                                        formatCurrency={formatCurrency}
                                        userId={user.id}
                                    />
                                );
                            } else {
                                const s = item.settlement;
                                const fromMember = getMember(s.from);
                                const toMember = getMember(s.to);
                                const isInvolved = s.from === user.id || s.to === user.id;
                                return (
                                    <Box
                                        key={`settlement-${idx}`}
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1.5,
                                            px: 2,
                                            py: 1.5,
                                            bgcolor: "action.hover",
                                            borderRadius: 2,
                                            borderLeft: "3px solid",
                                            borderColor: isInvolved ? "primary.main" : "transparent",
                                        }}
                                    >
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
                                            <Avatar
                                                src={fromMember?.avatar || undefined}
                                                sx={{ bgcolor: "error.dark", width: { xs: 32, sm: 36 }, height: { xs: 32, sm: 36 }, fontSize: { xs: 13, sm: 14 } }}
                                            >
                                                {fromMember?.username[0]?.toUpperCase()}
                                            </Avatar>
                                            <EastIcon sx={{ fontSize: { xs: 14, sm: 16 }, color: "text.disabled" }} />
                                            <Avatar
                                                src={toMember?.avatar || undefined}
                                                sx={{ bgcolor: "success.dark", width: { xs: 32, sm: 36 }, height: { xs: 32, sm: 36 }, fontSize: { xs: 13, sm: 14 } }}
                                            >
                                                {toMember?.username[0]?.toUpperCase()}
                                            </Avatar>
                                        </Box>
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                                {s.from === user.id ? "You" : fromMember?.username} settled with {s.to === user.id ? "you" : toMember?.username}
                                            </Typography>
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25, flexWrap: "nowrap", minWidth: 0 }}>
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {new Date(s.settled_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                                </Typography>
                                                <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 0.75 }}>
                                                    <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "text.disabled", flexShrink: 0 }} />
                                                    <Typography variant="caption" color="text.secondary">
                                                        {new Date(s.settled_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Box>
                                        <Typography
                                            variant="subtitle2"
                                            sx={{ fontWeight: 700, color: "success.main", flexShrink: 0 }}
                                        >
                                            {formatCurrency(s.amount, s.currency)}
                                        </Typography>
                                    </Box>
                                );
                            }
                        })}
                    </Box>
                </>
            ) : (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                        No activity yet
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
