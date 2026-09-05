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
    ContributionInput, PiggyBankInput, XenBudgetPiggyBankContribution, XenBudgetPiggyBank,
} from "../../../hooks/xenbudget/types";
import { useXenBudgetPiggyBanks } from "../../../hooks/xenbudget/usePiggyBanks";
import PiggyBankCard from "./components/piggyBank/PiggyBankCard";
import PiggyBankForm from "./components/piggyBank/PiggyBankForm";
import ContributionForm from "./components/piggyBank/ContributionForm";
import { bankTotals, sortPiggyBanks } from "./components/piggyBank/piggyBankProgress";
import { useBalancedColumns } from "./components/budget/useBalancedColumns";
import { formatCurrency } from "./currency";
import { cardSx, emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";

/** Which bank a contribution dialog is open for, and which way the money is going. */
interface ContributionTarget {
    bank: XenBudgetPiggyBank;
    direction: "in" | "out";
    contribution?: XenBudgetPiggyBankContribution | null;
}

/**
 * Piggy banks: what is being saved for, and what has gone into each.
 *
 * Its own page rather than a card on the Overview, but reached from a button there rather
 * than from the tab bar (see navigation.ts): a bank is not a figure for the period being
 * looked at — it accumulates across all of them — and its ledger needs room the Overview's
 * window-scoped cards don't have. No tab is lit while this is open, but the tab bar is
 * still there above it, so leaving is a click on any of them.
 */
export default function BookPiggyBanks() {
    const { book } = useOutletContext<BookDetailContext>();
    // The book's own currency, not the Overview's currency switcher: that picks which of
    // the currencies present in the ITEMS to tally, and a bank is always denominated in
    // the book's. Following the switcher would blank the header the moment someone looked
    // at their USD spending.
    const currency = book.default_currency;
    const { enqueueSnackbar } = useSnackbar();

    const {
        createBankAsync, isCreatingBank,
        updateBankAsync, isUpdatingBank,
        deleteBankAsync, isDeletingBank,
        addContributionAsync, isAddingContribution,
        updateContributionAsync, isUpdatingContribution,
        deleteContributionAsync, isDeletingContribution,
    } = useXenBudgetPiggyBanks(book._id);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<XenBudgetPiggyBank | null>(null);
    const [contributing, setContributing] = useState<ContributionTarget | null>(null);
    const [showClosed, setShowClosed] = useState(false);

    const banks = book.piggy_banks ?? [];
    const closedCount = banks.filter((g) => g.status !== "active").length;
    const visible = useMemo(
        () => sortPiggyBanks(showClosed ? banks : banks.filter((g) => g.status === "active")),
        [banks, showClosed],
    );
    const totals = useMemo(() => bankTotals(banks), [banks]);

    const isSm = useMediaQuery("(min-width:600px)");
    const isMd = useMediaQuery("(min-width:900px)");
    const isXl = useMediaQuery("(min-width:1536px)");
    const columnCount = isXl ? 4 : isMd ? 3 : isSm ? 2 : 1;
    // Same fixed-column masonry the Overview's budget cards use: expanding a bank's ledger
    // only pushes the cards below it in its own column, so nothing jumps sideways.
    const { columns, measureRef } = useBalancedColumns(visible, columnCount);

    const isBusy = isCreatingBank || isUpdatingBank || isDeletingBank
        || isAddingContribution || isUpdatingContribution || isDeletingContribution;

    const handleSubmitBank = async (input: PiggyBankInput) => {
        if (editing) await updateBankAsync({ bankId: editing._id, input });
        else await createBankAsync(input);
    };

    const handleSetStatus = async (bank: XenBudgetPiggyBank, status: XenBudgetPiggyBank["status"]) => {
        try {
            await updateBankAsync({ bankId: bank._id, input: { status } });
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to update bank", { variant: "error" });
        }
    };

    const handleSubmitContribution = async (input: ContributionInput) => {
        if (!contributing) return;
        const { bank, contribution } = contributing;
        if (contribution) {
            await updateContributionAsync({ bankId: bank._id, contributionId: contribution._id, input });
        } else {
            await addContributionAsync({ bankId: bank._id, input });
        }
    };

    const handleDeleteContribution = async (
        bank: XenBudgetPiggyBank, contribution: XenBudgetPiggyBankContribution,
    ) => {
        const warning = contribution.item_id
            ? "Remove this entry? The transaction it created is deleted too."
            : "Remove this entry?";
        if (!window.confirm(warning)) return;
        try {
            await deleteContributionAsync({ bankId: bank._id, contributionId: contribution._id });
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
                        New bank
                    </Button>
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pl: 2, pr: { xs: 2, sm: 3.5 }, pb: 2 }}>
                {visible.length === 0 ? (
                    <Box sx={emptyStateSx}>
                        <Box sx={emptyStateIconCircleSx}><SavingsIcon color="disabled" /></Box>
                        <Typography variant="subtitle1">
                            {banks.length === 0 ? "Nothing being saved for yet" : "No banks in progress"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Add a bank — a new car, a trip — and put money into it whenever you like.
                        </Typography>
                    </Box>
                ) : (
                    <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
                        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                            {columns.map((col, i) => (
                                <Stack key={i} spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                                    {col.map((bank) => (
                                        <Box key={bank._id} ref={measureRef(bank._id)}>
                                            <PiggyBankCard
                                                bank={bank}
                                                members={book.members}
                                                categoryRegistry={book.categories}
                                                onContribute={(g) => setContributing({ bank: g, direction: "in" })}
                                                onWithdraw={(g) => setContributing({ bank: g, direction: "out" })}
                                                onEdit={(g) => { setEditing(g); setFormOpen(true); }}
                                                onSetStatus={handleSetStatus}
                                                onEditContribution={(g, c) => setContributing({
                                                    bank: g, direction: c.amount < 0 ? "out" : "in", contribution: c,
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

            <PiggyBankForm
                open={formOpen}
                onClose={() => { setFormOpen(false); setEditing(null); }}
                book={book}
                bank={editing}
                onSubmit={handleSubmitBank}
                isSubmitting={isCreatingBank || isUpdatingBank}
                onDelete={editing ? () => deleteBankAsync(editing._id) : undefined}
            />

            {contributing && (
                <ContributionForm
                    open
                    onClose={() => setContributing(null)}
                    // Read back out of the book rather than held in state: the dialog stays
                    // open across a save, and a stale copy would check the next withdrawal
                    // against the balance from before the last one.
                    bank={banks.find((g) => g._id === contributing.bank._id) ?? contributing.bank}
                    direction={contributing.direction}
                    contribution={contributing.contribution}
                    onSubmit={handleSubmitContribution}
                    isSubmitting={isAddingContribution || isUpdatingContribution}
                />
            )}
        </Box>
    );
}
