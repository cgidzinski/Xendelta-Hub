import { useOutletContext } from "react-router-dom";
import { Box, Typography, Button, List } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { GroupDetailContext } from "./GroupDetail";
import ExpenseListItem from "./components/ExpenseListItem";

export default function GroupExpenses() {
    const { group, formatCurrency, onAddExpense, onViewExpense, user } = useOutletContext<GroupDetailContext>();

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                    Expenses
                </Typography>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddExpense}>
                    Add Expense
                </Button>
            </Box>
            {group.expenses.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                        No expenses yet
                    </Typography>
                </Box>
            ) : (
                <List disablePadding>
                    {group.expenses.map((expense) => (
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
