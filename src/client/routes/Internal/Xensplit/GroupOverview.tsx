import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Avatar, Button, Collapse, IconButton, Chip } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EastIcon from "@mui/icons-material/East";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfMonth, subMonths } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitExpense, XenSplitSettlement } from "../../../hooks/xensplit/types";
import ExpenseListItem from "./components/ExpenseListItem";
import { formatCurrency } from "../../../utils/currencyUtils";

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa", "#fb923c", "#34d399"];

type ActivityItem =
    | { type: "expense"; date: string; expense: XenSplitExpense }
    | { type: "settlement"; date: string; settlement: XenSplitSettlement };

export default function GroupOverview() {
    const { group, balancesData, user, onViewExpense } = useOutletContext<GroupDetailContext>();
    const navigate = useNavigate();
    const { groupId } = useParams<{ groupId: string }>();
    const [analyticsOpen, setAnalyticsOpen] = useState(false);

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

    // Spending analytics
    const defaultCurrency = group.default_currency || "USD";

    const analyticsAvailableCurrencies = useMemo(() => {
        const seen = new Set<string>();
        group.expenses.forEach(e => seen.add(e.currency));
        return [...seen].sort((a, b) => a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : a.localeCompare(b));
    }, [group.expenses, defaultCurrency]);

    const [analyticsSelectedCurrency, setAnalyticsSelectedCurrency] = useState(
        () => analyticsAvailableCurrencies[0] ?? defaultCurrency
    );

    const memberSpendData = useMemo(() => {
        const totals: { [userId: string]: number } = {};
        group.expenses.filter(e => e.currency === analyticsSelectedCurrency).forEach((e) => {
            totals[e.paid_by] = (totals[e.paid_by] ?? 0) + e.amount;
        });
        return Object.entries(totals).map(([userId, value]) => ({
            name: group.members.find(m => m.user_id === userId)?.username ?? userId,
            value,
        })).filter(d => d.value > 0);
    }, [group.expenses, group.members, analyticsSelectedCurrency]);

    const monthlySpendData = useMemo(() => {
        const months: { [key: string]: number } = {};
        for (let i = 12; i >= 0; i--) {
            const d = startOfMonth(subMonths(new Date(), i));
            months[format(d, "MMM yy")] = 0;
        }
        group.expenses.filter(e => e.currency === analyticsSelectedCurrency).forEach(e => {
            const key = format(startOfMonth(new Date(e.date)), "MMM yy");
            if (key in months) months[key] = (months[key] ?? 0) + e.amount;
        });
        return Object.entries(months).map(([month, total]) => ({ month, total }));
    }, [group.expenses, analyticsSelectedCurrency]);

    return (
        <Box>
            {/* Pending settlements — always visible */}
            <Button
                fullWidth
                variant="outlined"
                color={userSettlements.length > 0 ? "warning" : "inherit"}
                size="small"
                onClick={() => navigate(`/internal/xensplit/groups/${groupId}/settlements`)}
                sx={{ mb: 2, borderRadius: 2, fontWeight: 600, ...(userSettlements.length === 0 && { borderColor: "divider", color: "text.disabled" }) }}
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
                                    color: (amount as number) >= 0 ? "warning.main" : "error.main",
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

            {/* Analytics section */}
            {group.expenses.length > 0 && (
                <Box sx={{ mb: 3, bgcolor: "action.hover", borderRadius: 2, overflow: "hidden" }}>
                    <Box
                        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, cursor: "pointer" }}
                        onClick={() => setAnalyticsOpen((o) => !o)}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                Analytics
                            </Typography>
                            {analyticsAvailableCurrencies.length > 1 && (
                                <Box sx={{ display: "flex", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            const idx = analyticsAvailableCurrencies.indexOf(analyticsSelectedCurrency);
                                            setAnalyticsSelectedCurrency(analyticsAvailableCurrencies[(idx - 1 + analyticsAvailableCurrencies.length) % analyticsAvailableCurrencies.length]);
                                        }}
                                    >
                                        <ChevronLeftIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                    <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, minWidth: 28, textAlign: "center" }}>
                                        {analyticsSelectedCurrency}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            const idx = analyticsAvailableCurrencies.indexOf(analyticsSelectedCurrency);
                                            setAnalyticsSelectedCurrency(analyticsAvailableCurrencies[(idx + 1) % analyticsAvailableCurrencies.length]);
                                        }}
                                    >
                                        <ChevronRightIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Box>
                            )}
                        </Box>
                        <IconButton size="small" sx={{ transform: analyticsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                            <ExpandMoreIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    <Collapse in={analyticsOpen}>
                        <Box sx={{ px: 2, pb: 2 }}>
                            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1 }}>Who paid most</Typography>
                                <ResponsiveContainer width="100%" height={180}>
                                    <PieChart>
                                        <Pie data={memberSpendData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                                            {memberSpendData.map((_, i) => (
                                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v) => formatCurrency(Number(v), analyticsSelectedCurrency)} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 2, mb: 1 }}>Monthly spend (last 12 months)</Typography>
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={monthlySpendData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip formatter={(v) => formatCurrency(Number(v), analyticsSelectedCurrency)} />
                                        <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                        </Box>
                    </Collapse>
                </Box>
            )}

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
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                                    {s.from === user.id ? "You" : fromMember?.username} settled with {s.to === user.id ? "you" : toMember?.username}
                                                </Typography>
                                                {s.is_partial && (
                                                    <Chip label="Partial" size="small" color="warning" variant="outlined" sx={{ fontSize: "0.6rem", height: 18, px: 0 }} />
                                                )}
                                            </Box>
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
