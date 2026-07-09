import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, TextField, InputAdornment, ToggleButtonGroup, ToggleButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { startOfWeek, startOfMonth, startOfYear, subWeeks } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import ExpenseListItem from "./components/ExpenseListItem";

type DateFilter = "all" | "thisWeek" | "lastWeek" | "thisMonth" | "thisYear";

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
    { label: "All", value: "all" },
    { label: "This Week", value: "thisWeek" },
    { label: "Last Week", value: "lastWeek" },
    { label: "This Month", value: "thisMonth" },
    { label: "This Year", value: "thisYear" },
];

export default function GroupExpenses() {
    const { group, onViewExpense, user } = useOutletContext<GroupDetailContext>();
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");

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
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {sortedItems.map((row) => (
                            <ExpenseListItem
                                key={row.item._id}
                                expense={row.item}
                                onClick={() => onViewExpense(row.item)}
                                userId={user.id}
                            />
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
}
