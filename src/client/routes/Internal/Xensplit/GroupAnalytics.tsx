import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, Button, IconButton } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfMonth, subMonths } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import { formatCurrency } from "../../../utils/currencyUtils";

const CHART_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa", "#fb923c", "#34d399"];

export default function GroupAnalytics() {
    const { group, user, balancesData } = useOutletContext<GroupDetailContext>();

    const defaultCurrency = group.default_currency || "CAD";

    const availableCurrencies = useMemo(() => {
        const seen = new Set<string>();
        group.expenses.forEach((e) => seen.add(e.currency));
        return [...seen].sort((a, b) => (a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : a.localeCompare(b)));
    }, [group.expenses, defaultCurrency]);

    const [selectedCurrency, setSelectedCurrency] = useState(() => availableCurrencies[0] ?? defaultCurrency);

    const currencyExpenses = useMemo(
        () => group.expenses.filter((e) => e.currency === selectedCurrency),
        [group.expenses, selectedCurrency]
    );

    const stats = useMemo(() => {
        const total = currencyExpenses.reduce((sum, e) => sum + e.amount, 0);
        const count = currencyExpenses.length;
        const average = count > 0 ? total / count : 0;
        const largest = currencyExpenses.reduce((max, e) => Math.max(max, e.amount), 0);
        return { total, count, average, largest };
    }, [currencyExpenses]);

    const personalStats = useMemo(() => {
        const paidByYou = currencyExpenses.filter((e) => e.paid_by === user.id).length;
        const balance = balancesData?.balances[user.id]?.balances[selectedCurrency] ?? 0;
        return { paidByYou, balance };
    }, [currencyExpenses, user.id, balancesData, selectedCurrency]);

    const memberSpendData = useMemo(() => {
        const totals: { [userId: string]: number } = {};
        currencyExpenses.forEach((e) => {
            totals[e.paid_by] = (totals[e.paid_by] ?? 0) + e.amount;
        });
        return Object.entries(totals)
            .map(([userId, value]) => ({
                name: group.members.find((m) => m.user_id === userId)?.username ?? userId,
                value,
            }))
            .filter((d) => d.value > 0);
    }, [currencyExpenses, group.members]);

    const categorySpendData = useMemo(() => {
        const totals: { [category: string]: number } = {};
        currencyExpenses.forEach((e) => {
            const key = e.category?.trim() || "Uncategorized";
            totals[key] = (totals[key] ?? 0) + e.amount;
        });
        return Object.entries(totals)
            .map(([name, value]) => ({ name, value }))
            .filter((d) => d.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [currencyExpenses]);

    const monthlySpendData = useMemo(() => {
        const months: { [key: string]: number } = {};
        for (let i = 12; i >= 0; i--) {
            const d = startOfMonth(subMonths(new Date(), i));
            months[format(d, "MMM yy")] = 0;
        }
        currencyExpenses.forEach((e) => {
            const key = format(startOfMonth(new Date(e.date)), "MMM yy");
            if (key in months) months[key] = (months[key] ?? 0) + e.amount;
        });
        return Object.entries(months).map(([month, total]) => ({ month, total }));
    }, [currencyExpenses]);

    const handleExportCSV = () => {
        const memberName = (userId: string) => group.members.find((m) => m.user_id === userId)?.username ?? userId;
        const rows: string[][] = [["Date", "Title", "Paid By", "Amount", "Currency", "Split Type", "Notes", ...group.members.map((m) => m.username)]];
        for (const e of group.expenses) {
            const memberAmounts = group.members.map((m) => {
                const split = e.splits.find((s) => s.user_id === m.user_id);
                if (!split) return "";
                if (split.amount_owed !== undefined) return split.amount_owed.toFixed(2);
                if (split.percentage !== undefined) return `${split.percentage}%`;
                return (e.amount / e.splits.length).toFixed(2);
            });
            rows.push([new Date(e.date).toISOString(), e.title, memberName(e.paid_by), e.amount.toFixed(2), e.currency, e.split_type, e.notes ?? "", ...memberAmounts]);
        }
        rows.push([]);
        rows.push(["Date", "From", "To", "Amount", "Currency"]);
        for (const s of group.settlements) {
            rows.push([new Date(s.settled_at).toISOString(), memberName(s.from), memberName(s.to), s.amount.toFixed(2), s.currency]);
        }
        const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${group.name.replace(/[^a-z0-9]/gi, "_")}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (group.expenses.length === 0) {
        return (
            <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography variant="body1" color="text.secondary">
                    No expenses to analyze yet
                </Typography>
            </Box>
        );
    }

    return (
        <Box>
            {/* Header + currency switcher */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, minHeight: 40 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Analytics
                </Typography>
                {availableCurrencies.length > 1 && (
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                        <IconButton
                            size="small"
                            onClick={() => {
                                const idx = availableCurrencies.indexOf(selectedCurrency);
                                setSelectedCurrency(availableCurrencies[(idx - 1 + availableCurrencies.length) % availableCurrencies.length]);
                            }}
                        >
                            <ChevronLeftIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 36, textAlign: "center" }}>
                            {selectedCurrency}
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={() => {
                                const idx = availableCurrencies.indexOf(selectedCurrency);
                                setSelectedCurrency(availableCurrencies[(idx + 1) % availableCurrencies.length]);
                            }}
                        >
                            <ChevronRightIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                )}
            </Box>

            {/* Summary stat cards */}
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.5, mb: 3 }}>
                {[
                    {
                        label: "Total spent",
                        value: formatCurrency(stats.total, selectedCurrency),
                        sub: personalStats.balance === 0
                            ? "You're settled up"
                            : `${personalStats.balance > 0 ? "You're owed" : "You owe"} ${formatCurrency(Math.abs(personalStats.balance), selectedCurrency)}`,
                        subColor: personalStats.balance === 0 ? "text.disabled" : personalStats.balance > 0 ? "warning.main" : "error.main",
                    },
                    {
                        label: "Expenses",
                        value: `${stats.count}`,
                        sub: `${personalStats.paidByYou} paid by you`,
                    },
                    { label: "Average expense", value: formatCurrency(stats.average, selectedCurrency) },
                    { label: "Largest expense", value: formatCurrency(stats.largest, selectedCurrency) },
                ].map((card) => (
                    <Box key={card.label} sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2, minWidth: 0 }}>
                        <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.5 }}
                        >
                            {card.label}
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>
                            {card.value}
                        </Typography>
                        {card.sub && (
                            <Typography
                                variant="caption"
                                sx={{ display: "block", mt: 0.75, fontWeight: 600, color: card.subColor ?? "text.disabled" }}
                                noWrap
                            >
                                {card.sub}
                            </Typography>
                        )}
                    </Box>
                ))}
            </Box>

            {/* Who paid most */}
            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2, mb: 2 }}>
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Who paid most
                </Typography>
                <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                        <Pie data={memberSpendData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                            {memberSpendData.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(Number(v), selectedCurrency)} />
                    </PieChart>
                </ResponsiveContainer>
            </Box>

            {/* Spending by category */}
            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2, mb: 2 }}>
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Spending by category
                </Typography>
                <ResponsiveContainer width="100%" height={Math.max(120, categorySpendData.length * 38)}>
                    <BarChart data={categorySpendData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip formatter={(v) => formatCurrency(Number(v), selectedCurrency)} />
                        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                            {categorySpendData.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </Box>

            {/* Monthly spend */}
            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2, mb: 3 }}>
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Monthly spend (last 12 months)
                </Typography>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthlySpendData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => formatCurrency(Number(v), selectedCurrency)} />
                        <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Box>

            {/* Export */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48 }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>Export</Typography>
                    <Typography variant="caption" color="text.secondary">Download all expenses and settlements</Typography>
                </Box>
                <Button variant="outlined" size="small" startIcon={<FileDownloadIcon />} onClick={handleExportCSV}>
                    Export CSV
                </Button>
            </Box>
        </Box>
    );
}
