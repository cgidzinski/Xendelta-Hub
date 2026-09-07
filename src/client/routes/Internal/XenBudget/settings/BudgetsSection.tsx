import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box, Button, InputAdornment, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SavingsIcon from "@mui/icons-material/Savings";
import SearchIcon from "@mui/icons-material/Search";
import type { BookDetailContext } from "../BookDetail";
import type { BudgetStatus } from "../../../../hooks/xenbudget/types";
import { useXenBudgetStatus, useXenBudgetBudgets } from "../../../../hooks/xenbudget/useBudgets";
import BudgetRow from "../components/budget/BudgetRow";
import { sortBudgets, budgetLabel, type BudgetSortOrder } from "../components/budget/sortBudgets";
import BudgetForm from "../components/BudgetForm";
import SectionCard from "./SectionCard";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { emptyStateSx, emptyStateIconCircleSx } from "../../../../components/ui/surfaceStyles";

export default function BookBudgets() {
    const { book, currency } = useOutletContext<BookDetailContext>();
    const { budgets, isLoading, isError, error } = useXenBudgetStatus(book._id, currency);
    const {
        createBudgetAsync, isCreatingBudget, updateBudgetAsync, isUpdatingBudget, deleteBudgetAsync,
    } = useXenBudgetBudgets(book._id);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<BudgetStatus | null>(null);
    const [search, setSearch] = useState("");
    const [sortOrder, setSortOrder] = useState<BudgetSortOrder>("priority");

    if (isLoading && budgets.length === 0) return <LoadingSpinner message="Checking budgets..." />;
    if (isError) return <ErrorDisplay error={error} />;

    const query = search.trim().toLowerCase();
    const filtered = query
        ? budgets.filter((b) => budgetLabel(b).toLowerCase().includes(query))
        : budgets;
    const visible = sortBudgets(filtered, sortOrder);

    return (
        <Stack spacing={2}>
            <SectionCard
                title="Budgets"
                description="Cap one or more categories, or everything in the book — and give anyone their own limit inside it."
            >
                <Stack direction="row" justifyContent="flex-end">
                    <Button
                        size="small" startIcon={<AddIcon />}
                        onClick={() => { setEditing(null); setFormOpen(true); }}
                    >
                        New budget
                    </Button>
                </Stack>

                {budgets.length > 0 && (
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                        <TextField
                            size="small" placeholder="Search budgets"
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            sx={{ flexGrow: 1 }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                                    ),
                                },
                            }}
                        />
                        <TextField
                            select size="small" label="Sort" value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as BudgetSortOrder)}
                            sx={{ minWidth: 160, flexShrink: 0 }}
                        >
                            <MenuItem value="priority">Priority</MenuItem>
                            <MenuItem value="name_asc">Name (A-Z)</MenuItem>
                            <MenuItem value="name_desc">Name (Z-A)</MenuItem>
                        </TextField>
                    </Stack>
                )}

                {budgets.length === 0 ? (
                    <Box sx={emptyStateSx}>
                        <Box sx={emptyStateIconCircleSx}><SavingsIcon color="disabled" /></Box>
                        <Typography variant="subtitle1">No budgets yet</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add your first budget to start capping spending.
                        </Typography>
                    </Box>
                ) : visible.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                        No budgets match "{search.trim()}".
                    </Typography>
                ) : (
                    /* One card per budget rather than one card holding them all: on this page
                    every budget is its own editable thing, so each needs its own target. */
                    <Stack spacing={1}>
                        {visible.map((budget) => (
                            <BudgetRow
                                key={budget._id}
                                budget={budget}
                                currency={currency}
                                categoryRegistry={book.categories}
                                members={book.members}
                                onEdit={() => { setEditing(budget); setFormOpen(true); }}
                            />
                        ))}
                    </Stack>
                )}
            </SectionCard>

            <BudgetForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                book={book}
                budget={editing}
                isSubmitting={isCreatingBudget || isUpdatingBudget}
                onSubmit={async (input) => {
                    if (editing) await updateBudgetAsync({ budgetId: editing._id, input });
                    else await createBudgetAsync(input);
                }}
                onDelete={editing ? () => deleteBudgetAsync(editing._id) : undefined}
            />
        </Stack>
    );
}
