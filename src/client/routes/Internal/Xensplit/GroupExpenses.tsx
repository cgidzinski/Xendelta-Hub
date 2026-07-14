import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, TextField, InputAdornment, ToggleButtonGroup, ToggleButton, Avatar, IconButton, alpha } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RepeatIcon from "@mui/icons-material/Repeat";
import CloseIcon from "@mui/icons-material/Close";
import { startOfWeek, startOfMonth, startOfYear, subWeeks } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import ExpenseListItem, { FREQUENCY_LABELS } from "./components/ExpenseListItem";
import { formatCurrency } from "../../../utils/currencyUtils";
import { xsCardSx, xsBadgeSx } from "./components/rowStyles";

type DateFilter = "all" | "thisWeek" | "lastWeek" | "thisMonth" | "thisYear";

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
    { label: "All", value: "all" },
    { label: "This Week", value: "thisWeek" },
    { label: "Last Week", value: "lastWeek" },
    { label: "This Month", value: "thisMonth" },
    { label: "This Year", value: "thisYear" },
];

export default function GroupExpenses() {
    const { group, onViewExpense, user, cancelRecurring, isCancellingRecurring } = useOutletContext<GroupDetailContext>();
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");

    // Genesis expense id -> its recurring series, for chips on genesis rows
    const seriesByGenesisId = useMemo(() => {
        const map = new Map<string, NonNullable<typeof group.recurring_expenses>[number]>();
        for (const r of group.recurring_expenses ?? []) {
            if (r.genesis_expense_id) map.set(r.genesis_expense_id, r);
        }
        return map;
    }, [group.recurring_expenses]);

    // Future-start series that haven't created their first expense yet — exempt from date filter
    const pendingSeries = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (group.recurring_expenses ?? [])
            .filter((r) => !r.genesis_expense_id && r.active)
            .filter((r) => !q || (r.pending_expense?.title ?? "").toLowerCase().includes(q))
            .sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime());
    }, [group.recurring_expenses, search]);

    // Held expenses, visible to all group members — exempt from date filter
    const heldVisible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return [...group.expenses]
            .filter((e) => e.on_hold)
            .filter((e) => !q || e.title.toLowerCase().includes(q))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [group.expenses, search]);

    // Active expenses + exchanges merged and date-filtered
    const sortedItems = useMemo(() => {
        const now = new Date();
        const dateStart: Date | null =
            dateFilter === "thisWeek" ? startOfWeek(now) :
                dateFilter === "lastWeek" ? startOfWeek(subWeeks(now, 1)) :
                    dateFilter === "thisMonth" ? startOfMonth(now) :
                        dateFilter === "thisYear" ? startOfYear(now) :
                            null;
        const dateEnd: Date | null =
            dateFilter === "lastWeek" ? startOfWeek(now) : null;

        const expenses = group.expenses
            .filter((e) => !e.on_hold)
            .filter((e) => {
                if (search.trim() && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
                const d = new Date(e.date);
                if (dateStart && d < dateStart) return false;
                if (dateEnd && d >= dateEnd) return false;
                return true;
            })
            .map((e) => ({ type: "expense" as const, date: e.date, item: e }));

        return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [group.expenses, group.exchanges, search, dateFilter]);

    // Group the (already date-desc sorted) list into ordered day-groups, like the Overview feed
    const groupedItems = useMemo(() => {
        const groups: { key: string; label: string; items: typeof sortedItems }[] = [];
        for (const row of sortedItems) {
            const d = new Date(row.date);
            const key = d.toDateString();
            const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            const last = groups[groups.length - 1];
            if (last && last.key === key) last.items.push(row);
            else groups.push({ key, label, items: [row] });
        }
        return groups;
    }, [sortedItems]);

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ flexShrink: 0 }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Search expenses…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                    sx={{ mb: 1.5 }}
                />
                <ToggleButtonGroup
                    size="small"
                    value={dateFilter}
                    exclusive
                    onChange={(_, v) => v && setDateFilter(v)}
                    fullWidth
                    sx={{ mb: 2, height: 30 }}
                >
                    {DATE_FILTERS.map((f) => (
                        <ToggleButton key={f.value} value={f.value} sx={{ px: 1, fontSize: "0.7rem", textTransform: "none", whiteSpace: "nowrap" }}>
                            {f.label}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: { xs: 11, md: 1 } }}>
                {pendingSeries.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                        <Typography
                            variant="caption"
                            sx={{ px: 0.5, mb: 0.75, display: "block", color: "secondary.main", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.65rem" }}
                        >
                            Upcoming Recurring
                        </Typography>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            {pendingSeries.map((series) => (
                                <Box
                                    key={series._id}
                                    sx={{
                                        ...xsCardSx,
                                        display: "grid",
                                        gridTemplateColumns: "40px 1fr auto",
                                        alignItems: "center",
                                        columnGap: 1.25,
                                        opacity: 0.75,
                                        borderStyle: "dashed",
                                    }}
                                >
                                    <Avatar sx={{ ...xsBadgeSx, bgcolor: (t) => alpha(t.palette.secondary.main, 0.15) }}>
                                        <RepeatIcon sx={{ fontSize: 22, color: "secondary.main" }} />
                                    </Avatar>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                            {series.pending_expense?.title ?? "Recurring expense"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                            Starts {new Date(series.next_run_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                            {" · "}{FREQUENCY_LABELS[series.frequency]}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                        {series.pending_expense?.amount != null && (
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                                {formatCurrency(series.pending_expense.amount, series.pending_expense.currency ?? group.default_currency)}
                                            </Typography>
                                        )}
                                        {(series.created_by === user.id || group.created_by === user.id) && (
                                            <IconButton
                                                size="small"
                                                disabled={isCancellingRecurring}
                                                onClick={() => {
                                                    if (window.confirm("Cancel this upcoming recurring expense? No expenses have been created yet.")) {
                                                        cancelRecurring(series._id);
                                                    }
                                                }}
                                            >
                                                <CloseIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        )}
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
                {heldVisible.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                        <Typography
                            variant="caption"
                            sx={{ px: 0.5, mb: 0.75, display: "block", color: "warning.main", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.65rem" }}
                        >
                            Held Expenses
                        </Typography>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            {heldVisible.map((expense) => (
                                <ExpenseListItem
                                    key={expense._id}
                                    expense={expense}
                                    onClick={() => onViewExpense(expense)}
                                    userId={user.id}
                                    recurringSeries={seriesByGenesisId.get(expense._id)}
                                />
                            ))}
                        </Box>
                    </Box>
                )}
                {sortedItems.length === 0 ? (
                    <Box sx={{ textAlign: "center", py: heldVisible.length > 0 ? 3 : 6 }}>
                        <Typography variant="body1" color="text.secondary">
                            {search.trim() || dateFilter !== "all" ? "No expenses match your filters" : "No expenses yet"}
                        </Typography>
                    </Box>
                ) : (
                    groupedItems.map((dateGroup) => (
                        <Box key={dateGroup.key} sx={{ mb: 2.5 }}>
                            <Typography
                                variant="caption"
                                color="text.disabled"
                                sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1, ml: 0.25 }}
                            >
                                {dateGroup.label}
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                {dateGroup.items.map((row) => (
                                    <ExpenseListItem
                                        key={row.item._id}
                                        expense={row.item}
                                        onClick={() => onViewExpense(row.item)}
                                        userId={user.id}
                                        hideDate
                                        recurringSeries={seriesByGenesisId.get(row.item._id)}
                                    />
                                ))}
                            </Box>
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
}
