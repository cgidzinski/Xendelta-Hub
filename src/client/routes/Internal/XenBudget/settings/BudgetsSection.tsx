import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SavingsIcon from "@mui/icons-material/Savings";
import type { BookDetailContext } from "../BookDetail";
import type { BudgetStatus } from "../../../../hooks/xenbudget/types";
import { useXenBudgetStatus, useXenBudgetBudgets } from "../../../../hooks/xenbudget/useBudgets";
import BudgetProgressBar from "../components/BudgetProgressBar";
import BudgetForm from "../components/BudgetForm";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { cardSx, emptyStateSx, emptyStateIconCircleSx } from "../../../../components/ui/surfaceStyles";

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
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="subtitle1">Budgets</Typography>
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
                        Set a limit on a person, one or more categories, or everything in the book.
                    </Typography>
                </Box>
            ) : (
                <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
                    <Stack spacing={2}>
                        {budgets.map((budget) => (
                            <BudgetProgressBar
                                key={budget._id}
                                budget={budget}
                                currency={currency}
                                categoryRegistry={book.categories}
                                onClick={() => { setEditing(budget); setFormOpen(true); }}
                            />
                        ))}
                    </Stack>
                </Card>
            )}

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
        </Box>
    );
}
