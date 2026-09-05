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
    XenBudgetPiggyBankContribution, XenBudgetLabel, XenBudgetMember, XenBudgetPiggyBank,
} from "../../../../../hooks/xenbudget/types";
import { CategoryChip } from "../LabelChip";
import BudgetBar from "../budget/BudgetBar";
import { limitColor, limitState } from "../budget/budgetKind";
import { cardSx } from "../../../../../components/ui/surfaceStyles";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";
import { formatCurrency } from "../../currency";
import { bankCaption, bankProgress } from "./piggyBankProgress";
import ContributionList from "./ContributionList";

interface PiggyBankCardProps {
    bank: XenBudgetPiggyBank;
    members: XenBudgetMember[];
    categoryRegistry: XenBudgetLabel[];
    onContribute: (bank: XenBudgetPiggyBank) => void;
    onWithdraw: (bank: XenBudgetPiggyBank) => void;
    onEdit: (bank: XenBudgetPiggyBank) => void;
    onSetStatus: (bank: XenBudgetPiggyBank, status: XenBudgetPiggyBank["status"]) => void;
    onEditContribution: (bank: XenBudgetPiggyBank, contribution: XenBudgetPiggyBankContribution) => void;
    onDeleteContribution: (bank: XenBudgetPiggyBank, contribution: XenBudgetPiggyBankContribution) => void;
    isBusy: boolean;
}

/**
 * One piggy bank: what it is, how far along it is, and what has gone into it.
 *
 * The bar is the budget one, told it is measuring a bank - a floor where passing the
 * amount is the success state - so a piggy bank and a savings BUDGET read identically
 * rather than each having their own idea of what "full" looks like.
 */
export default function PiggyBankCard({
    bank, members, categoryRegistry, onContribute, onWithdraw, onEdit, onSetStatus,
    onEditContribution, onDeleteContribution, isBusy,
}: PiggyBankCardProps) {
    const [open, setOpen] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

    const { remaining, percent, reached } = bankProgress(bank.saved, bank.target_amount);
    // No pace: a piggy bank has no deadline to fall behind, so there is nothing to
    // compare progress against but the target itself.
    const state = limitState("floor", percent);
    const caption = bankCaption(remaining, percent, (v) => formatCurrency(v, bank.currency));
    const closed = bank.status !== "active";

    const closeMenu = () => setMenuAnchor(null);
    const act = (fn: () => void) => () => { closeMenu(); fn(); };

    return (
        <Card variant="outlined" sx={{ ...cardSx, p: 1.5, opacity: closed ? 0.75 : 1 }}>
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 0.75 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap sx={{ minWidth: 0 }}>{bank.name}</Typography>
                        {bank.status === "completed" && (
                            <Chip size="small" label="Done" sx={{ height: 18, fontSize: 11 }} />
                        )}
                        {bank.status === "archived" && (
                            <Chip size="small" variant="outlined" label="Archived" sx={{ height: 18, fontSize: 11 }} />
                        )}
                        {bank.status === "active" && reached && (
                            <Chip
                                size="small" label="Reached"
                                sx={{ height: 18, fontSize: 11, bgcolor: INCOME_COLOR, color: "common.black" }}
                            />
                        )}
                    </Stack>
                    {bank.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                            {bank.description}
                        </Typography>
                    )}
                </Box>
                <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Bank actions">
                    <MoreVertIcon fontSize="small" />
                </IconButton>
            </Stack>

            <BudgetBar
                spent={Math.max(0, bank.saved)}
                amount={bank.target_amount}
                percent={percent}
                over={bank.saved > bank.target_amount}
                direction="floor"
                color={INCOME_COLOR}
                label={`${bank.name}: ${formatCurrency(bank.saved, bank.currency)} of ${formatCurrency(bank.target_amount, bank.currency)} saved`}
            />

            <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mt: 0.75 }}>
                <Typography variant="body2" noWrap>
                    {formatCurrency(bank.saved, bank.currency)}
                    <Typography component="span" variant="body2" color="text.secondary">
                        {" of "}{formatCurrency(bank.target_amount, bank.currency)}
                    </Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: limitColor(state), flexShrink: 0 }}>
                    {caption}
                </Typography>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}>
                <Button
                    size="small" variant="contained" startIcon={<AddIcon />}
                    disabled={isBusy} onClick={() => onContribute(bank)}
                >
                    Contribute
                </Button>
                <Button
                    size="small" variant="outlined" startIcon={<RemoveIcon />}
                    disabled={isBusy || bank.saved <= 0} onClick={() => onWithdraw(bank)}
                >
                    Take out
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                {bank.category && (
                    <CategoryChip name={bank.category} registry={categoryRegistry} size="small" />
                )}
            </Stack>

            <ButtonBase
                onClick={() => setOpen((v) => !v)}
                sx={{ width: "100%", justifyContent: "space-between", mt: 1, px: 0.5, py: 0.25, borderRadius: 1 }}
            >
                <Typography variant="caption" color="text.secondary">
                    {bank.contribution_count === 0
                        ? "No contributions yet"
                        : `${bank.contribution_count} contribution${bank.contribution_count === 1 ? "" : "s"}`}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    {/* Who has put in, ordered biggest first by the server. A shared bank
                    is the one place the split is the interesting part. */}
                    {bank.by_person.slice(0, 4).map((p) => {
                        const member = members.find((m) => m.user_id === p.user_id);
                        return (
                            <Tooltip
                                key={p.user_id}
                                title={`${member?.username ?? "Someone"} · ${formatCurrency(p.amount, bank.currency)}`}
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
                {/* The books LIST ships banks without their ledgers, so this component is
                only ever mounted where the detail payload supplied one. */}
                <ContributionList
                    contributions={bank.contributions ?? []}
                    currency={bank.currency}
                    members={members}
                    onEdit={(c) => onEditContribution(bank, c)}
                    onDelete={(c) => onDeleteContribution(bank, c)}
                    isBusy={isBusy}
                />
            </Collapse>

            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
                <MenuItem onClick={act(() => onEdit(bank))}>Edit</MenuItem>
                {bank.status === "completed"
                    ? <MenuItem onClick={act(() => onSetStatus(bank, "active"))}>Reopen</MenuItem>
                    : <MenuItem onClick={act(() => onSetStatus(bank, "completed"))}>Mark complete</MenuItem>}
                {bank.status === "archived"
                    ? <MenuItem onClick={act(() => onSetStatus(bank, "active"))}>Unarchive</MenuItem>
                    : <MenuItem onClick={act(() => onSetStatus(bank, "archived"))}>Archive</MenuItem>}
            </Menu>
        </Card>
    );
}
