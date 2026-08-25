import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Button, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SavingsIcon from "@mui/icons-material/Savings";
import type { BookDetailContext } from "../BookDetail";
import type { BudgetStatus } from "../../../../hooks/xenbudget/types";
import { useXenBudgetStatus, useXenBudgetBudgets } from "../../../../hooks/xenbudget/useBudgets";
import BudgetRow from "../components/budget/BudgetRow";
import { sortBudgets } from "../components/budget/sortBudgets";
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

    if (isLoading && budgets.length === 0) return <LoadingSpinner message="Checking budgets..." />;
    if (isError) return <ErrorDisplay error={error} />;

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

                {budgets.length === 0 ? (
                    <Box sx={emptyStateSx}>
                        <Box sx={emptyStateIconCircleSx}><SavingsIcon color="disabled" /></Box>
                        <Typography variant="subtitle1">No budgets yet</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add your first budget to start capping spending.
                        </Typography>
                    </Box>
                ) : (
                    /* One card per budget rather than one card holding them all: on this page
                    every budget is its own editable thing, so each needs its own target. */
                    <Stack spacing={1}>
                        {sortBudgets(budgets).map((budget) => (
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
