import { useEffect, useState } from "react";
import {
    Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    InputAdornment, MenuItem, Stack, TextField,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, BudgetInput, BudgetScope, BudgetPeriod, BudgetStatus,
} from "../../../../hooks/xenbudget/types";
import { getCurrencySymbol, sanitizeAmount, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";

const SCOPES: { value: BudgetScope; label: string }[] = [
    { value: "all", label: "Everything in the book" },
    { value: "category", label: "A category" },
    { value: "person", label: "A person" },
];

const PERIODS: { value: BudgetPeriod; label: string }[] = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
    { value: "custom", label: "One-off date range" },
];

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
    const [scope, setScope] = useState<BudgetScope>("all");
    const [category, setCategory] = useState("");
    const [personId, setPersonId] = useState("");
    const [period, setPeriod] = useState<BudgetPeriod>("monthly");
    const [amount, setAmount] = useState("");
    const [startDate, setStartDate] = useState<Date | null>(new Date());
    const [endDate, setEndDate] = useState<Date | null>(null);

    useEffect(() => {
        if (!open) return;
        if (budget) {
            setScope(budget.scope);
            setCategory(budget.category || "");
            setPersonId(budget.person_id || "");
            setPeriod(budget.period);
            setAmount(String(budget.amount));
            setStartDate(new Date(budget.period_from));
            setEndDate(budget.period === "custom" ? new Date(budget.period_to) : null);
        } else {
            setScope("all");
            setCategory("");
            setPersonId("");
            setPeriod("monthly");
            setAmount("");
            setStartDate(new Date());
            setEndDate(null);
        }
    }, [open, budget]);

    const numericAmount = parseFloat(amount) || 0;
    const canSubmit = numericAmount > 0
        && (scope !== "category" || !!category.trim())
        && (scope !== "person" || !!personId)
        && (period !== "custom" || (!!startDate && !!endDate && endDate > startDate));

    const handleSubmit = async () => {
        try {
            await onSubmit({
                scope,
                category: scope === "category" ? category.trim() : undefined,
                person_id: scope === "person" ? personId : undefined,
                period,
                amount: numericAmount,
                start_date: (startDate || new Date()).toISOString(),
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
                        select fullWidth label="Limit applies to" value={scope}
                        onChange={(e) => setScope(e.target.value as BudgetScope)}
                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                    >
                        {SCOPES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </TextField>

                    {scope === "category" && (
                        <Autocomplete
                            freeSolo
                            options={book.categories.map((c) => c.name)}
                            value={category}
                            onInputChange={(_, v) => setCategory(v)}
                            renderInput={(params) => <TextField {...params} label="Category" />}
                        />
                    )}

                    {scope === "person" && (
                        <TextField
                            select fullWidth label="Person" value={personId}
                            onChange={(e) => setPersonId(e.target.value)}
                            slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                        >
                            {book.members.map((m) => (
                                <MenuItem key={m.user_id} value={m.user_id}>{m.username}</MenuItem>
                            ))}
                        </TextField>
                    )}

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

                    <DatePicker
                        label={period === "custom" ? "Starts" : "Resets on"}
                        value={startDate}
                        onChange={setStartDate}
                        // Recurring periods run from this date rather than snapping to the
                        // calendar, so a monthly budget anchored on the 15th runs 15th-to-15th.
                        slotProps={{
                            textField: {
                                helperText: period === "custom"
                                    ? undefined
                                    : "Periods run from this date, not the calendar month.",
                            },
                        }}
                    />

                    {period === "custom" && (
                        <DatePicker label="Ends" value={endDate} onChange={setEndDate} />
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
