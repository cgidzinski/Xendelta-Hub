import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box, Button, Card, FormControlLabel, Stack, Switch, Typography, useMediaQuery,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SavingsIcon from "@mui/icons-material/Savings";
import { useSnackbar } from "notistack";
import type { BookDetailContext } from "./BookDetail";
import type {
    ContributionInput, GoalInput, XenBudgetGoalContribution, XenBudgetSavingsGoal,
} from "../../../hooks/xenbudget/types";
import { useXenBudgetGoals } from "../../../hooks/xenbudget/useGoals";
import GoalCard from "./components/goals/GoalCard";
import GoalForm from "./components/goals/GoalForm";
import ContributionForm from "./components/goals/ContributionForm";
import { goalTotals, sortGoals } from "./components/goals/goalProgress";
import { useBalancedColumns } from "./components/budget/useBalancedColumns";
import { formatCurrency } from "./currency";
import { cardSx, emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";

/** Which goal a contribution dialog is open for, and which way the money is going. */
interface ContributionTarget {
    goal: XenBudgetSavingsGoal;
    direction: "in" | "out";
    contribution?: XenBudgetGoalContribution | null;
}

/**
 * Savings goals: what is being saved for, and what has gone into each.
 *
 * Deliberately its own tab rather than a card on the Overview. A goal is not a figure for
 * the period being looked at — it accumulates across all of them — and its ledger needs
 * room the Overview's window-scoped cards don't have.
 */
export default function BookGoals() {
    const { book, currency } = useOutletContext<BookDetailContext>();
    const { enqueueSnackbar } = useSnackbar();

    const {
        createGoalAsync, isCreatingGoal,
        updateGoalAsync, isUpdatingGoal,
        deleteGoalAsync, isDeletingGoal,
        addContributionAsync, isAddingContribution,
        updateContributionAsync, isUpdatingContribution,
        deleteContributionAsync, isDeletingContribution,
    } = useXenBudgetGoals(book._id);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<XenBudgetSavingsGoal | null>(null);
    const [contributing, setContributing] = useState<ContributionTarget | null>(null);
    const [showClosed, setShowClosed] = useState(false);

    const goals = book.savings_goals ?? [];
    const closedCount = goals.filter((g) => g.status !== "active").length;
    const visible = useMemo(
        () => sortGoals(showClosed ? goals : goals.filter((g) => g.status === "active")),
        [goals, showClosed],
    );
    const totals = useMemo(() => goalTotals(goals, currency), [goals, currency]);

    const isSm = useMediaQuery("(min-width:600px)");
    const isMd = useMediaQuery("(min-width:900px)");
    const isXl = useMediaQuery("(min-width:1536px)");
    const columnCount = isXl ? 4 : isMd ? 3 : isSm ? 2 : 1;
    // Same fixed-column masonry the Overview's budget cards use: expanding a goal's ledger
    // only pushes the cards below it in its own column, so nothing jumps sideways.
    const { columns, measureRef } = useBalancedColumns(visible, columnCount);

    const isBusy = isCreatingGoal || isUpdatingGoal || isDeletingGoal
        || isAddingContribution || isUpdatingContribution || isDeletingContribution;

    const handleSubmitGoal = async (input: GoalInput) => {
        if (editing) await updateGoalAsync({ goalId: editing._id, input });
        else await createGoalAsync(input);
    };

    const handleSetStatus = async (goal: XenBudgetSavingsGoal, status: XenBudgetSavingsGoal["status"]) => {
        try {
            await updateGoalAsync({ goalId: goal._id, input: { status } });
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to update goal", { variant: "error" });
        }
    };

    const handleSubmitContribution = async (input: ContributionInput) => {
        if (!contributing) return;
        const { goal, contribution } = contributing;
        if (contribution) {
            await updateContributionAsync({ goalId: goal._id, contributionId: contribution._id, input });
        } else {
            await addContributionAsync({ goalId: goal._id, input });
        }
    };

    const handleDeleteContribution = async (
        goal: XenBudgetSavingsGoal, contribution: XenBudgetGoalContribution,
    ) => {
        const warning = contribution.item_id
            ? "Remove this entry? The transaction it created is deleted too."
            : "Remove this entry?";
        if (!window.confirm(warning)) return;
        try {
            await deleteContributionAsync({ goalId: goal._id, contributionId: contribution._id });
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to remove entry", { variant: "error" });
        }
    };

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ pl: 2, pr: { xs: 2, sm: 3.5 }, pt: 2, pb: 1.5, flexShrink: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={sectionLabelSx}>Saved so far</Typography>
                        <Typography variant="h6" noWrap>
                            {formatCurrency(totals.saved, currency)}
                            <Typography component="span" variant="body2" color="text.secondary">
                                {" of "}{formatCurrency(totals.target, currency)}
                            </Typography>
                        </Typography>
                    </Box>
                    {closedCount > 0 && (
                        <FormControlLabel
                            control={<Switch size="small" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />}
                            label={<Typography variant="caption">Show finished</Typography>}
                        />
                    )}
                    <Button
                        size="small" variant="contained" startIcon={<AddIcon />}
                        onClick={() => { setEditing(null); setFormOpen(true); }}
                    >
                        New goal
                    </Button>
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pl: 2, pr: { xs: 2, sm: 3.5 }, pb: 2 }}>
                {visible.length === 0 ? (
                    <Box sx={emptyStateSx}>
                        <Box sx={emptyStateIconCircleSx}><SavingsIcon color="disabled" /></Box>
                        <Typography variant="subtitle1">
                            {goals.length === 0 ? "Nothing being saved for yet" : "No goals in progress"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add a goal — a new car, a trip — and put money into it whenever you like.
                        </Typography>
                    </Box>
                ) : (
                    <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
                        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                            {columns.map((col, i) => (
                                <Stack key={i} spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                                    {col.map((goal) => (
                                        <Box key={goal._id} ref={measureRef(goal._id)}>
                                            <GoalCard
                                                goal={goal}
                                                members={book.members}
                                                categoryRegistry={book.categories}
                                                onContribute={(g) => setContributing({ goal: g, direction: "in" })}
                                                onWithdraw={(g) => setContributing({ goal: g, direction: "out" })}
                                                onEdit={(g) => { setEditing(g); setFormOpen(true); }}
                                                onSetStatus={handleSetStatus}
                                                onEditContribution={(g, c) => setContributing({
                                                    goal: g, direction: c.amount < 0 ? "out" : "in", contribution: c,
                                                })}
                                                onDeleteContribution={handleDeleteContribution}
                                                isBusy={isBusy}
                                            />
                                        </Box>
                                    ))}
                                </Stack>
                            ))}
                        </Box>
                    </Card>
                )}
            </Box>

            <GoalForm
                open={formOpen}
                onClose={() => { setFormOpen(false); setEditing(null); }}
                book={book}
                goal={editing}
                onSubmit={handleSubmitGoal}
                isSubmitting={isCreatingGoal || isUpdatingGoal}
                onDelete={editing ? () => deleteGoalAsync(editing._id) : undefined}
            />

            {contributing && (
                <ContributionForm
                    open
                    onClose={() => setContributing(null)}
                    // Read back out of the book rather than held in state: the dialog stays
                    // open across a save, and a stale copy would check the next withdrawal
                    // against the balance from before the last one.
                    goal={goals.find((g) => g._id === contributing.goal._id) ?? contributing.goal}
                    direction={contributing.direction}
                    contribution={contributing.contribution}
                    onSubmit={handleSubmitContribution}
                    isSubmitting={isAddingContribution || isUpdatingContribution}
                />
            )}
        </Box>
    );
}
