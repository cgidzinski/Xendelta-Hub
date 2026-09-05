import { useEffect, useState } from "react";
import {
    Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, InputAdornment, Stack, TextField, Typography, useMediaQuery,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useSnackbar } from "notistack";
import type {
    ContributionInput, XenBudgetGoalContribution, XenBudgetSavingsGoal,
} from "../../../../../hooks/xenbudget/types";
import { formatCurrency, getCurrencySymbol } from "../../currency";
import { sanitizeAmount } from "../../../../../utils/currencyUtils";

interface ContributionFormProps {
    open: boolean;
    onClose: () => void;
    goal: XenBudgetSavingsGoal;
    /** "out" takes money back out of the goal. Fixed while editing an existing entry. */
    direction: "in" | "out";
    /** Present when an existing ledger entry is being corrected rather than added. */
    contribution?: XenBudgetGoalContribution | null;
    onSubmit: (input: ContributionInput) => Promise<unknown>;
    isSubmitting: boolean;
}

export default function ContributionForm({
    open, onClose, goal, direction, contribution, onSubmit, isSubmitting,
}: ContributionFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const isMobile = useMediaQuery("(max-width:600px)");
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState<Date | null>(new Date());
    const [note, setNote] = useState("");
    const [recordItem, setRecordItem] = useState(true);

    const out = direction === "out";
    const editing = !!contribution;

    useEffect(() => {
        if (!open) return;
        if (contribution) {
            setAmount(String(Math.abs(contribution.amount)));
            setDate(new Date(contribution.date));
            setNote(contribution.note || "");
            // Whether this entry has a transaction is settled when it is created: an edit
            // keeps the linked item in step, it doesn't add or remove one.
            setRecordItem(!!contribution.item_id);
        } else {
            setAmount("");
            setDate(new Date());
            setNote("");
            setRecordItem(true);
        }
    }, [open, contribution]);

    const numericAmount = parseFloat(amount);
    // The server refuses a withdrawal bigger than the balance; saying so here saves the
    // round trip and stops the amount being retyped.
    const tooMuch = out && numericAmount > goal.saved + (contribution ? Math.abs(contribution.amount) : 0);
    const canSubmit = numericAmount > 0 && !tooMuch;

    const handleSubmit = async () => {
        try {
            await onSubmit({
                amount: numericAmount,
                direction,
                date: (date ?? new Date()).toISOString(),
                note: note.trim() || undefined,
                ...(editing ? {} : { record_item: recordItem }),
            });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save contribution", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={isMobile}>
            <DialogTitle>
                {editing ? "Edit entry" : out ? `Take out of ${goal.name}` : `Put into ${goal.name}`}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {formatCurrency(goal.saved, goal.currency)} of{" "}
                        {formatCurrency(goal.target_amount, goal.currency)} saved so far.
                    </Typography>
                    <TextField
                        autoFocus fullWidth label="Amount" value={amount}
                        onChange={(e) => {
                            const clean = sanitizeAmount(e.target.value);
                            if (clean !== null) setAmount(clean);
                        }}
                        error={tooMuch}
                        helperText={tooMuch ? "That's more than this goal holds." : undefined}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {getCurrencySymbol(goal.currency)}
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                    <DatePicker label="Date" value={date} onChange={setDate} />
                    <TextField
                        fullWidth label="Note" value={note}
                        onChange={(e) => setNote(e.target.value)}
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                        helperText="Optional — also names the transaction, if one is recorded."
                    />
                    {editing ? (
                        contribution?.item_id && (
                            <Alert severity="info">
                                The transaction this entry created is updated to match.
                            </Alert>
                        )
                    ) : (
                        <>
                            <FormControlLabel
                                control={(
                                    <Checkbox
                                        checked={recordItem}
                                        onChange={(e) => setRecordItem(e.target.checked)}
                                    />
                                )}
                                label="Also record this as a transaction"
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                                {/* Which way round it books surprises people, so it says so
                                rather than leaving it to be discovered in the items list. */}
                                {out
                                    ? "Adds it to your items as income — the money is coming back out of savings."
                                    : `Adds it to your items as an expense${goal.category ? ` under ${goal.category}` : ""} — the money has left your account.`}
                            </Typography>
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                    {editing ? "Save" : out ? "Take out" : "Contribute"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
