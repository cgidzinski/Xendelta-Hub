import { useEffect, useMemo, useState } from "react";
import {
    Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton,
    ToggleButtonGroup, Typography, useMediaQuery,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, BudgetInput, BudgetMeasures, BudgetPeriod, BudgetStatus,
} from "../../../../hooks/xenbudget/types";
import { formatCurrency, getCurrencySymbol } from "../currency";
import { sanitizeAmount, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { budgetPeriodWindow } from "./budget/budgetForRange";
import { monthlyEquivalent, windowLabel } from "./budget/periodDisplay";

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

/** A per-person limit while it's being edited, so a half-typed amount stays a string. */
interface SubDraft {
    person_id: string;
    amount: string;
}

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
    const isMobile = useMediaQuery("(max-width:600px)");
    const [measures, setMeasures] = useState<BudgetMeasures>("expense");
    const [categories, setCategories] = useState<string[]>([]);
    const [period, setPeriod] = useState<BudgetPeriod>("monthly");
    const [amount, setAmount] = useState("");
    const [subs, setSubs] = useState<SubDraft[]>([]);
    const [startDate, setStartDate] = useState<Date | null>(new Date());
    const [endDate, setEndDate] = useState<Date | null>(null);

    useEffect(() => {
        if (!open) return;
        if (budget) {
            setMeasures(budget.measures);
            setCategories(budget.categories || []);
            setPeriod(budget.period);
            setAmount(budget.amount === undefined ? "" : String(budget.amount));
            setSubs(budget.sub_budgets.map((s) => ({ person_id: s.person_id, amount: String(s.amount) })));
            setStartDate(budget.period === "custom" ? new Date(budget.period_from) : new Date());
            setEndDate(budget.period === "custom" ? new Date(budget.period_to) : null);
        } else {
            setMeasures("expense");
            setCategories([]);
            setPeriod("monthly");
            setAmount("");
            setSubs([]);
            setStartDate(new Date());
            setEndDate(null);
        }
    }, [open, budget]);

    const currency = book.default_currency;
    const numericAmount = parseFloat(amount) || 0;
    // Only the rows that carry a real amount become limits; a row someone added and left
    // blank is still being filled in, not a cap of zero.
    const validSubs = useMemo(
        () => subs.filter((s) => s.person_id && (parseFloat(s.amount) || 0) > 0),
        [subs],
    );
    const allocated = validSubs.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    // Only a worry on an expense budget. Per-person targets adding up past an income one
    // the household would save more than it set out to, which is not a mistake.
    const overAllocated = measures === "expense" && numericAmount > 0 && allocated > numericAmount;
    const isIncome = measures === "income";

    // The window the chosen period currently covers (or the picked dates for a one-off),
    // for the live "per month" and current-window previews. A saved budget gets this back
    // from the server; a budget being drafted has to work it out itself.
    let previewWindow: { from: string; to: string } | null;
    if (period === "custom") {
        previewWindow = startDate && endDate
            ? { from: startDate.toISOString(), to: endDate.toISOString() }
            : null;
    } else {
        const { from, to } = budgetPeriodWindow(period, new Date());
        previewWindow = { from: from.toISOString(), to: to.toISOString() };
    }
    const monthlyAmount = monthlyEquivalent(period, numericAmount);
    const previewWindowLabel = previewWindow
        ? windowLabel(period, previewWindow.from, previewWindow.to)
        : undefined;

    // A member can hold at most one limit per budget, so the picker only offers the ones
    // not already listed.
    const availableMembers = book.members.filter(
        (m) => !subs.some((s) => s.person_id === m.user_id),
    );

    const canSubmit = (numericAmount > 0 || validSubs.length > 0)
        && (period !== "custom" || (!!startDate && !!endDate && endDate > startDate));

    const setSub = (index: number, patch: Partial<SubDraft>) => {
        setSubs((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    };

    const handleSubmit = async () => {
        try {
            await onSubmit({
                categories,
                measures,
                period,
                amount: numericAmount > 0 ? numericAmount : undefined,
                sub_budgets: validSubs.map((s) => ({
                    person_id: s.person_id,
                    amount: parseFloat(s.amount),
                })),
                start_date: period === "custom" && startDate ? startDate.toISOString() : undefined,
                end_date: period === "custom" && endDate ? endDate.toISOString() : undefined,
            });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save budget", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={isMobile}>
            <DialogTitle>{budget ? "Edit budget" : "New budget"}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {/* What it measures comes first: it decides which way the amount
                    points - a ceiling on expenses, a floor under income - so every field
                    below reads differently, and picking it last would read backwards. */}
                    <Box>
                        <ToggleButtonGroup
                            size="small" exclusive fullWidth value={measures}
                            onChange={(_, v) => v && setMeasures(v as BudgetMeasures)}
                        >
                            <ToggleButton value="expense">Expenses</ToggleButton>
                            <ToggleButton value="income">Income</ToggleButton>
                        </ToggleButtonGroup>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                            {isIncome
                                ? "Income in these categories counts toward the target. Falling short is the warning — going past it is better."
                                : "Spending in these categories counts against the limit. Going past it is flagged."}
                        </Typography>
                    </Box>

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
                        fullWidth label={isIncome ? "Overall target" : "Overall amount"} value={amount}
                        onChange={(e) => {
                            const clean = sanitizeAmount(e.target.value);
                            if (clean !== null) setAmount(clean);
                        }}
                        helperText={[
                            isIncome
                                ? "The target for everyone together. Leave empty to set targets only for the people below."
                                : "The limit for everyone together. Leave empty to cap only the people below.",
                            monthlyAmount !== undefined
                                ? `≈ ${formatCurrency(monthlyAmount, currency)}/mo`
                                : undefined,
                        ].filter(Boolean).join(" · ")}
                        slotProps={{
                            htmlInput: { inputMode: "decimal" },
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {getCurrencySymbol(currency)}
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />

                    <Box>
                        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                            {isIncome ? "Per-person targets" : "Per-person limits"}
                        </Typography>
                        <Stack spacing={1.5}>
                            {subs.map((sub, index) => (
                                <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
                                    <TextField
                                        select size="small" label="Person" value={sub.person_id}
                                        onChange={(e) => setSub(index, { person_id: e.target.value })}
                                        sx={{ flex: 1, minWidth: 0 }}
                                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                                    >
                                        {book.members
                                            .filter((m) => m.user_id === sub.person_id
                                                || availableMembers.some((a) => a.user_id === m.user_id))
                                            .map((m) => (
                                                <MenuItem key={m.user_id} value={m.user_id}>{m.username}</MenuItem>
                                            ))}
                                    </TextField>
                                    <TextField
                                        size="small" label="Amount" value={sub.amount}
                                        onChange={(e) => {
                                            const clean = sanitizeAmount(e.target.value);
                                            if (clean !== null) setSub(index, { amount: clean });
                                        }}
                                        sx={{ width: 120, flexShrink: 0 }}
                                        slotProps={{
                                            htmlInput: { inputMode: "decimal" },
                                            input: {
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        {getCurrencySymbol(currency)}
                                                    </InputAdornment>
                                                ),
                                            },
                                        }}
                                    />
                                    <IconButton
                                        size="small" aria-label="Remove limit"
                                        onClick={() => setSubs((c) => c.filter((_, i) => i !== index))}
                                        sx={{ mt: 0.5, flexShrink: 0 }}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}

                            <Box>
                                <Button
                                    size="small" startIcon={<AddIcon />}
                                    disabled={availableMembers.length === 0}
                                    onClick={() => setSubs((c) => [
                                        ...c,
                                        { person_id: availableMembers[0]?.user_id ?? "", amount: "" },
                                    ])}
                                >
                                    Add a person
                                </Button>
                            </Box>

                            {validSubs.length > 0 && numericAmount > 0 && (
                                <Typography
                                    variant="caption"
                                    color={overAllocated ? "warning.main" : "text.secondary"}
                                >
                                    {overAllocated
                                        ? `${formatCurrency(allocated, currency)} of personal limits exceeds the ${formatCurrency(numericAmount, currency)} overall limit.`
                                        : `${formatCurrency(allocated, currency)} of ${formatCurrency(numericAmount, currency)} allocated · ${formatCurrency(Math.max(0, numericAmount - allocated), currency)} unassigned.`}
                                </Typography>
                            )}
                        </Stack>
                    </Box>

                    <TextField
                        select fullWidth label="Period" value={period}
                        onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
                        helperText={[
                            isIncome
                                ? "Per-person targets use this same period."
                                : "Per-person limits use this same period.",
                            previewWindowLabel ? `Current window: ${previewWindowLabel}` : undefined,
                        ].filter(Boolean).join(" · ")}
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
