import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, TextField, InputAdornment, ToggleButtonGroup, ToggleButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { startOfWeek, startOfMonth, startOfYear, subWeeks } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import ExpenseListItem from "./components/ExpenseListItem";
import { formatCurrency } from "../../../utils/currencyUtils";

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

    const sortedExpenses = useMemo(() => {
        const now = new Date();
        const dateStart: Date | null =
            dateFilter === "thisWeek" ? startOfWeek(now) :
                dateFilter === "lastWeek" ? startOfWeek(subWeeks(now, 1)) :
                    dateFilter === "thisMonth" ? startOfMonth(now) :
                        dateFilter === "thisYear" ? startOfYear(now) :
                            null;
        const dateEnd: Date | null =
            dateFilter === "lastWeek" ? startOfWeek(now) : null;

        return [...group.expenses]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .filter((e) => {
                if (search.trim() && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
                const d = new Date(e.date);
                if (dateStart && d < dateStart) return false;
                if (dateEnd && d >= dateEnd) return false;
                return true;
            });
    }, [group.expenses, search, dateFilter]);

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                    Expenses ({sortedExpenses.length})
                </Typography>
            </Box>
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
            {sortedExpenses.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                        {search.trim() || dateFilter !== "all" ? "No expenses match your filters" : "No expenses yet"}
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {sortedExpenses.map((expense) => (
                        <ExpenseListItem
                            key={expense._id}
                            expense={expense}
                            onClick={() => onViewExpense(expense)}
                            userId={user.id}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
}
