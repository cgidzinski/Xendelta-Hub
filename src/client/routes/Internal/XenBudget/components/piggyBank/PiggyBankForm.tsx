import { useEffect, useState } from "react";
import {
    Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    InputAdornment, Stack, TextField, useMediaQuery,
} from "@mui/material";
import { useSnackbar } from "notistack";
import type { XenBudgetBook, PiggyBankInput, XenBudgetPiggyBank } from "../../../../../hooks/xenbudget/types";
import { getCurrencySymbol } from "../../currency";
import { sanitizeAmount } from "../../../../../utils/currencyUtils";



interface PiggyBankFormProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
    bank?: XenBudgetPiggyBank | null;
    onSubmit: (input: PiggyBankInput) => Promise<unknown>;
    isSubmitting: boolean;
    onDelete?: () => Promise<unknown>;
}

export default function PiggyBankForm({
    open, onClose, book, bank, onSubmit, isSubmitting, onDelete,
}: PiggyBankFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const isMobile = useMediaQuery("(max-width:600px)");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [target, setTarget] = useState("");
    const [category, setCategory] = useState<string | null>(null);

    // A bank is denominated in the book's currency, not picked per bank: a book keeps one
    // default, and an existing bank keeps whatever it was stamped with, since the money
    // already saved was saved in that.
    const currency = bank?.currency ?? book.default_currency;

    useEffect(() => {
        if (!open) return;
        if (bank) {
            setName(bank.name);
            setDescription(bank.description || "");
            setTarget(String(bank.target_amount));
            setCategory(bank.category || null);
        } else {
            setName("");
            setDescription("");
            setTarget("");
            // No default: the category names the budget line this money comes FROM, which
            // is different for every bank and is the one thing nobody else can guess.
            setCategory(null);
        }
    }, [open, bank, book]);

    const numericTarget = parseFloat(target);
    // The category is required: a contribution IS an expense, so one with nowhere to book
    // would land uncategorised.
    const canSubmit = name.trim().length > 0 && numericTarget > 0 && !!category;

    const handleSubmit = async () => {
        try {
            await onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                target_amount: numericTarget,
                category: category ?? undefined,
            });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save bank", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={isMobile}>
            <DialogTitle>{bank ? "Edit piggy bank" : "New piggy bank"}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        autoFocus fullWidth label="Name" value={name}
                        onChange={(e) => setName(e.target.value)}
                        slotProps={{ htmlInput: { maxLength: 100 } }}
                        placeholder="New car"
                    />
                    <TextField
                        fullWidth multiline minRows={2} label="Description" value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                        helperText="Optional — what you're saving for."
                    />
                    <TextField
                        fullWidth label="Target" value={target}
                        onChange={(e) => {
                            const clean = sanitizeAmount(e.target.value);
                            if (clean !== null) setTarget(clean);
                        }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {getCurrencySymbol(currency)}
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                    <Autocomplete
                        options={book.categories.map((c) => c.name)}
                        value={category}
                        onChange={(_, v) => setCategory(v)}
                        renderInput={(params) => (
                            <TextField
                                {...params} label="Category"
                                required
                                helperText="Contributions book as an expense here — the budget line this money comes from."
                            />
                        )}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                {bank && onDelete && (
                    <Button
                        color="error" sx={{ mr: "auto" }}
                        onClick={async () => {
                            try {
                                await onDelete();
                                onClose();
                            } catch (e) {
                                enqueueSnackbar(e instanceof Error ? e.message : "Failed to delete bank", { variant: "error" });
                            }
                        }}
                    >
                        Delete
                    </Button>
                )}
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                    {bank ? "Save" : "Create"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
