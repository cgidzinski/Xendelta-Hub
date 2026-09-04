import { useState } from "react";
import {
    Avatar, Box, Button, ButtonBase, Card, Chip, Collapse, Divider, IconButton, Menu,
    MenuItem, Stack, Tooltip, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import type {
    XenBudgetGoalContribution, XenBudgetLabel, XenBudgetMember, XenBudgetSavingsGoal,
} from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import BudgetBar from "../budget/BudgetBar";
import { limitCaption, limitColor, limitState } from "../budget/budgetKind";
import { cardSx } from "../../../../../components/ui/surfaceStyles";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";
import { formatCurrency } from "../../currency";
import { goalProgress } from "./goalProgress";
import ContributionList from "./ContributionList";

interface GoalCardProps {
    goal: XenBudgetSavingsGoal;
    members: XenBudgetMember[];
    categoryRegistry: XenBudgetLabel[];
    onContribute: (goal: XenBudgetSavingsGoal) => void;
    onWithdraw: (goal: XenBudgetSavingsGoal) => void;
    onEdit: (goal: XenBudgetSavingsGoal) => void;
    onSetStatus: (goal: XenBudgetSavingsGoal, status: XenBudgetSavingsGoal["status"]) => void;
    onEditContribution: (goal: XenBudgetSavingsGoal, contribution: XenBudgetGoalContribution) => void;
    onDeleteContribution: (goal: XenBudgetSavingsGoal, contribution: XenBudgetGoalContribution) => void;
    isBusy: boolean;
}

/**
 * One savings goal: what it is, how far along it is, and what has gone into it.
 *
 * The bar is the budget one, told it is measuring a goal - a floor where passing the
 * amount is the success state - so a savings goal and a savings BUDGET read identically
 * rather than each having their own idea of what "full" looks like.
 */
export default function GoalCard({
    goal, members, categoryRegistry, onContribute, onWithdraw, onEdit, onSetStatus,
    onEditContribution, onDeleteContribution, isBusy,
}: GoalCardProps) {
    const [open, setOpen] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

    const { remaining, percent, reached } = goalProgress(goal.saved, goal.target_amount);
    // No pace: a savings goal has no deadline to fall behind, so there is nothing to
    // compare progress against but the target itself.
    const state = limitState("goal", percent);
    const caption = limitCaption("goal", remaining, percent, (v) => formatCurrency(v, goal.currency));
    const closed = goal.status !== "active";

    const closeMenu = () => setMenuAnchor(null);
    const act = (fn: () => void) => () => { closeMenu(); fn(); };

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.5, opacity: closed ? 0.75 : 1 }}>
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 0.75 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap sx={{ minWidth: 0 }}>{goal.name}</Typography>
                        {goal.status === "completed" && (
                            <Chip size="small" label="Done" sx={{ height: 18, fontSize: 11 }} />
                        )}
                        {goal.status === "archived" && (
                            <Chip size="small" variant="outlined" label="Archived" sx={{ height: 18, fontSize: 11 }} />
                        )}
                        {goal.status === "active" && reached && (
                            <Chip
                                size="small" label="Reached"
                                sx={{ height: 18, fontSize: 11, bgcolor: INCOME_COLOR, color: "common.black" }}
                            />
                        )}
                    </Stack>
                    {goal.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                            {goal.description}
                        </Typography>
                    )}
                </Box>
                <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Goal actions">
                    <MoreVertIcon fontSize="small" />
                </IconButton>
            </Stack>

            <BudgetBar
                spent={Math.max(0, goal.saved)}
                amount={goal.target_amount}
                percent={percent}
                over={goal.saved > goal.target_amount}
                kind="goal"
                color={INCOME_COLOR}
                label={`${goal.name}: ${formatCurrency(goal.saved, goal.currency)} of ${formatCurrency(goal.target_amount, goal.currency)} saved`}
            />

            <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mt: 0.75 }}>
                <Typography variant="body2" noWrap>
                    {formatCurrency(goal.saved, goal.currency)}
                    <Typography component="span" variant="body2" color="text.secondary">
                        {" of "}{formatCurrency(goal.target_amount, goal.currency)}
                    </Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: limitColor(state), flexShrink: 0 }}>
                    {caption}
                </Typography>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}>
                <Button
                    size="small" variant="contained" startIcon={<AddIcon />}
                    disabled={isBusy} onClick={() => onContribute(goal)}
                >
                    Contribute
                </Button>
                <Button
                    size="small" variant="outlined" startIcon={<RemoveIcon />}
                    disabled={isBusy || goal.saved <= 0} onClick={() => onWithdraw(goal)}
                >
                    Take out
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                {goal.category && (
                    <CategoryChip name={goal.category} registry={categoryRegistry} size="small" />
                )}
            </Stack>

            <ButtonBase
                onClick={() => setOpen((v) => !v)}
                sx={{ width: "100%", justifyContent: "space-between", mt: 1, px: 0.5, py: 0.25, borderRadius: 1 }}
            >
                <Typography variant="caption" color="text.secondary">
                    {goal.contribution_count === 0
                        ? "No contributions yet"
                        : `${goal.contribution_count} contribution${goal.contribution_count === 1 ? "" : "s"}`}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    {/* Who has put in, ordered biggest first by the server. A shared goal
                    is the one place the split is the interesting part. */}
                    {goal.by_person.slice(0, 4).map((p) => {
                        const member = members.find((m) => m.user_id === p.user_id);
                        return (
                            <Tooltip
                                key={p.user_id}
                                title={`${member?.username ?? "Someone"} · ${formatCurrency(p.amount, goal.currency)}`}
                            >
                                <Avatar
                                    src={member?.avatar || undefined}
                                    sx={{ width: 20, height: 20, fontSize: 10 }}
                                >
                                    {(member?.username ?? "?")[0]?.toUpperCase()}
                                </Avatar>
                            </Tooltip>
                        );
                    })}
                    <ExpandMoreIcon
                        fontSize="small"
                        sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
                    />
                </Stack>
            </ButtonBase>

            <Collapse in={open} unmountOnExit>
                <Divider sx={{ my: 1 }} />
                {/* The books LIST ships goals without their ledgers, so this component is
                only ever mounted where the detail payload supplied one. */}
                <ContributionList
                    contributions={goal.contributions ?? []}
                    currency={goal.currency}
                    members={members}
                    onEdit={(c) => onEditContribution(goal, c)}
                    onDelete={(c) => onDeleteContribution(goal, c)}
                    isBusy={isBusy}
                />
            </Collapse>

            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
                <MenuItem onClick={act(() => onEdit(goal))}>Edit</MenuItem>
                {goal.status === "completed"
                    ? <MenuItem onClick={act(() => onSetStatus(goal, "active"))}>Reopen</MenuItem>
                    : <MenuItem onClick={act(() => onSetStatus(goal, "completed"))}>Mark complete</MenuItem>}
                {goal.status === "archived"
                    ? <MenuItem onClick={act(() => onSetStatus(goal, "active"))}>Unarchive</MenuItem>
                    : <MenuItem onClick={act(() => onSetStatus(goal, "archived"))}>Archive</MenuItem>}
            </Menu>
        </Card>
    );
}
