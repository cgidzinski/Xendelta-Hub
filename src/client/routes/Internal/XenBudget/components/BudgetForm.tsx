import { useEffect, useState } from "react";
import {
    Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    InputAdornment, MenuItem, Stack, TextField,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, BudgetInput, BudgetPeriod, BudgetStatus,
} from "../../../../hooks/xenbudget/types";
import { getCurrencySymbol, sanitizeAmount, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";

// Not "" — MUI's Select treats an empty-string value as unset, which stops the "Who"
// label from floating and makes the field look blank even though Everyone is selected.
const EVERYONE = "everyone";

const PERIODS: { value: BudgetPeriod; label: string }[] = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
    { value: "custom", label: "One-off date range" },
];

// Recurring periods always snap to the calendar rather than an anchor date, so this is
// informational only — there's nothing to pick.
const PERIOD_START_HINT: Record<BudgetPeriod, string> = {
    weekly: "Every Monday",
    monthly: "The 1st of the month",
    quarterly: "The 1st of the quarter",
    yearly: "January 1st",
    custom: "",
};

interface BudgetFormProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
    budget?: BudgetStatus | null;
    onSubmit: (input: BudgetInput) => Promise<unknown>;
    isSubmitting: boolean;
    onDelete?: () => Promise<unknown>;
}

export default function BudgetForm({
    open, onClose, book, budget, onSubmit, isSubmitting, onDelete,
}: BudgetFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const [personId, setPersonId] = useState(EVERYONE);
    const [categories, setCategories] = useState<string[]>([]);
    const [period, setPeriod] = useState<BudgetPeriod>("monthly");
    const [amount, setAmount] = useState("");
    const [startDate, setStartDate] = useState<Date | null>(new Date());
    const [endDate, setEndDate] = useState<Date | null>(null);

    useEffect(() => {
        if (!open) return;
        if (budget) {
            setPersonId(budget.person_id || EVERYONE);
            setCategories(budget.categories || []);
            setPeriod(budget.period);
            setAmount(String(budget.amount));
            setStartDate(budget.period === "custom" ? new Date(budget.period_from) : new Date());
            setEndDate(budget.period === "custom" ? new Date(budget.period_to) : null);
        } else {
            setPersonId(EVERYONE);
            setCategories([]);
            setPeriod("monthly");
            setAmount("");
            setStartDate(new Date());
            setEndDate(null);
        }
    }, [open, budget]);

    const numericAmount = parseFloat(amount) || 0;
    const canSubmit = numericAmount > 0
        && (period !== "custom" || (!!startDate && !!endDate && endDate > startDate));

    const handleSubmit = async () => {
        try {
            await onSubmit({
                person_id: personId === EVERYONE ? undefined : personId,
                categories,
                period,
                amount: numericAmount,
                start_date: period === "custom" && startDate ? startDate.toISOString() : undefined,
                end_date: period === "custom" && endDate ? endDate.toISOString() : undefined,
            });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save budget", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{budget ? "Edit budget" : "New budget"}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        select fullWidth label="Who" value={personId}
                        onChange={(e) => setPersonId(e.target.value)}
                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                    >
                        <MenuItem value={EVERYONE}>Everyone</MenuItem>
                        {book.members.map((m) => (
                            <MenuItem key={m.user_id} value={m.user_id}>{m.username}</MenuItem>
                        ))}
                    </TextField>

                    <Autocomplete
                        multiple freeSolo
                        options={book.categories.map((c) => c.name)}
                        value={categories}
                        onChange={(_, v) => setCategories(v)}
                        renderInput={(params) => (
                            <TextField
                                {...params} label="Categories"
                                helperText={categories.length === 0 ? "Leave empty to cover every category." : undefined}
                            />
                        )}
                    />

                    <TextField
                        fullWidth label="Amount" value={amount}
                        onChange={(e) => {
                            const clean = sanitizeAmount(e.target.value);
                            if (clean !== null) setAmount(clean);
                        }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {getCurrencySymbol(book.default_currency)}
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />

                    <TextField
                        select fullWidth label="Period" value={period}
                        onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                    >
                        {PERIODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                    </TextField>

                    {period === "custom" ? (
                        <>
                            <DatePicker label="Starts" value={startDate} onChange={setStartDate} />
                            <DatePicker label="Ends" value={endDate} onChange={setEndDate} />
                        </>
                    ) : (
                        <TextField
                            fullWidth disabled label="Resets on"
                            value={PERIOD_START_HINT[period]}
                        />
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {budget && onDelete && (
                    <Button
                        color="error" sx={{ mr: "auto" }}
                        onClick={async () => {
                            try {
                                await onDelete();
                                onClose();
                            } catch (e) {
                                enqueueSnackbar(e instanceof Error ? e.message : "Failed to delete budget", { variant: "error" });
                            }
                        }}
                    >
                        Delete
                    </Button>
                )}
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                    {budget ? "Save" : "Create"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
