import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, Button, List, TextField, InputAdornment, Chip, Stack } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { startOfMonth, startOfYear, subMonths } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import ExpenseListItem from "./components/ExpenseListItem";

type DateFilter = "all" | "thisMonth" | "lastMonth" | "thisYear";

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
    { label: "All", value: "all" },
    { label: "This month", value: "thisMonth" },
    { label: "Last month", value: "lastMonth" },
    { label: "This year", value: "thisYear" },
];

export default function GroupExpenses() {
    const { group, formatCurrency, onAddExpense, onViewExpense, user } = useOutletContext<GroupDetailContext>();
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");

    const sortedExpenses = useMemo(() => {
        const now = new Date();
        const dateStart: Date | null =
            dateFilter === "thisMonth" ? startOfMonth(now) :
                dateFilter === "lastMonth" ? startOfMonth(subMonths(now, 1)) :
                    dateFilter === "thisYear" ? startOfYear(now) :
                        null;
        const dateEnd: Date | null =
            dateFilter === "lastMonth" ? startOfMonth(now) : null;

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
                <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddExpense}>
                    Add Expense
                </Button>
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
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
                {DATE_FILTERS.map((f) => (
                    <Chip
                        key={f.value}
                        label={f.label}
                        size="small"
                        color={dateFilter === f.value ? "primary" : "default"}
                        variant={dateFilter === f.value ? "filled" : "outlined"}
                        onClick={() => setDateFilter(f.value)}
                        clickable
                    />
                ))}
            </Stack>
            {sortedExpenses.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                        {search.trim() || dateFilter !== "all" ? "No expenses match your filters" : "No expenses yet"}
                    </Typography>
                </Box>
            ) : (
                <List disablePadding>
                    {sortedExpenses.map((expense) => (
                        <ExpenseListItem
                            key={expense._id}
                            expense={expense}
                            onClick={() => onViewExpense(expense)}
                            formatCurrency={formatCurrency}
                            userId={user.id}
                            mb={1.5}
                        />
                    ))}
                </List>
            )}
        </Box>
    );
}
