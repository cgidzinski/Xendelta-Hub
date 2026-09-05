import { useEffect, useState } from "react";
import {
    Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    InputAdornment, Stack, TextField, Typography, useMediaQuery,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useSnackbar } from "notistack";
import type {
    ContributionInput, XenBudgetPiggyBankContribution, XenBudgetPiggyBank,
} from "../../../../../hooks/xenbudget/types";
import { formatCurrency, getCurrencySymbol } from "../../currency";
import { sanitizeAmount } from "../../../../../utils/currencyUtils";

interface ContributionFormProps {
    open: boolean;
    onClose: () => void;
    bank: XenBudgetPiggyBank;
    /** "out" takes money back out of the bank. Fixed while editing an existing entry. */
    direction: "in" | "out";
    /** Present when an existing ledger entry is being corrected rather than added. */
    contribution?: XenBudgetPiggyBankContribution | null;
    onSubmit: (input: ContributionInput) => Promise<unknown>;
    isSubmitting: boolean;
}

export default function ContributionForm({
    open, onClose, bank, direction, contribution, onSubmit, isSubmitting,
}: ContributionFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const isMobile = useMediaQuery("(max-width:600px)");
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState<Date | null>(new Date());
    const [note, setNote] = useState("");

    const out = direction === "out";
    const editing = !!contribution;

    useEffect(() => {
        if (!open) return;
        if (contribution) {
            setAmount(String(Math.abs(contribution.amount)));
            setDate(new Date(contribution.date));
            setNote(contribution.note || "");
        } else {
            setAmount("");
            setDate(new Date());
            setNote("");
        }
    }, [open, contribution]);

    const numericAmount = parseFloat(amount);
    const amountLabel = numericAmount > 0
        ? formatCurrency(numericAmount, bank.currency)
        : "this";
    // The server refuses a withdrawal bigger than the balance; saying so here saves the
    // round trip and stops the amount being retyped.
    const tooMuch = out && numericAmount > bank.saved + (contribution ? Math.abs(contribution.amount) : 0);
    const canSubmit = numericAmount > 0 && !tooMuch;

    const handleSubmit = async () => {
        try {
            await onSubmit({
                amount: numericAmount,
                direction,
                date: (date ?? new Date()).toISOString(),
                note: note.trim() || undefined,
            });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save contribution", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={isMobile}>
            <DialogTitle>
                {editing ? "Edit entry" : out ? `Take out of ${bank.name}` : `Put into ${bank.name}`}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {formatCurrency(bank.saved, bank.currency)} of{" "}
                        {formatCurrency(bank.target_amount, bank.currency)} saved so far.
                    </Typography>
                    <TextField
                        autoFocus fullWidth label="Amount" value={amount}
                        onChange={(e) => {
                            const clean = sanitizeAmount(e.target.value);
                            if (clean !== null) setAmount(clean);
                        }}
                        error={tooMuch}
                        helperText={tooMuch ? "That's more than this bank holds." : undefined}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {getCurrencySymbol(bank.currency)}
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
                        helperText="Optional — also names the transaction."
                    />
                    {/* Contributing IS booking an expense, so there is nothing to opt into
                    - but which way round it books still surprises people, and a withdrawal
                    booking as income under a spending category doubly so. Say it rather
                    than leave it to be discovered in the items list. */}
                    <Alert severity="info">
                        {editing
                            ? "The transaction this entry created is updated to match."
                            : out
                                ? `Books ${amountLabel} back as income under ${bank.category}.`
                                : `Books ${amountLabel} as an expense under ${bank.category}.`}
                    </Alert>
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
