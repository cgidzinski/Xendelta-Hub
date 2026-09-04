import { useEffect, useState } from "react";
import {
    Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    InputAdornment, Stack, TextField, useMediaQuery,
} from "@mui/material";
import { useSnackbar } from "notistack";
import type { XenBudgetBook, GoalInput, XenBudgetSavingsGoal } from "../../../../../hooks/xenbudget/types";
import { getCurrencySymbol } from "../../currency";
import { sanitizeAmount } from "../../../../../utils/currencyUtils";

/** The category a new goal's transactions default to, when the book still has it. */
const DEFAULT_CATEGORY = "Savings";

interface GoalFormProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
    goal?: XenBudgetSavingsGoal | null;
    onSubmit: (input: GoalInput) => Promise<unknown>;
    isSubmitting: boolean;
    onDelete?: () => Promise<unknown>;
}

export default function GoalForm({
    open, onClose, book, goal, onSubmit, isSubmitting, onDelete,
}: GoalFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const isMobile = useMediaQuery("(max-width:600px)");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [target, setTarget] = useState("");
    const [category, setCategory] = useState<string | null>(null);

    // A goal is denominated in the book's currency, not picked per goal: a book keeps one
    // default, and an existing goal keeps whatever it was stamped with, since the money
    // already saved was saved in that.
    const currency = goal?.currency ?? book.default_currency;

    useEffect(() => {
        if (!open) return;
        if (goal) {
            setName(goal.name);
            setDescription(goal.description || "");
            setTarget(String(goal.target_amount));
            setCategory(goal.category || null);
        } else {
            setName("");
            setDescription("");
            setTarget("");
            // Pre-picked rather than left blank: the starter category is seeded into every
            // book precisely so savings has somewhere to land, and a goal with no category
            // silently books its transactions as uncategorised.
            setCategory(
                book.categories.some((c) => c.name === DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : null,
            );
        }
    }, [open, goal, book]);

    const numericTarget = parseFloat(target);
    const canSubmit = name.trim().length > 0 && numericTarget > 0;

    const handleSubmit = async () => {
        try {
            await onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                target_amount: numericTarget,
                category: category || undefined,
            });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save goal", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={isMobile}>
            <DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle>
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
                                helperText="Used when a contribution is also recorded as a transaction."
                            />
                        )}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                {goal && onDelete && (
                    <Button
                        color="error" sx={{ mr: "auto" }}
                        onClick={async () => {
                            try {
                                await onDelete();
                                onClose();
                            } catch (e) {
                                enqueueSnackbar(e instanceof Error ? e.message : "Failed to delete goal", { variant: "error" });
                            }
                        }}
                    >
                        Delete
                    </Button>
                )}
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                    {goal ? "Save" : "Create"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
