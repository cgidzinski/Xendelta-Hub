import { useEffect, useMemo, useState } from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, InputAdornment, MenuItem, Stack, TextField, Typography, useMediaQuery,
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
import LabelPicker from "./LabelPicker";
import { budgetPeriodWindow } from "./budget/budgetForRange";
import { directionOf } from "./budget/budgetKind";
import { normalizedAmounts, periodNoun, windowLabel } from "./budget/periodDisplay";

/**
 * What a budget watches. Three values on one axis rather than a type plus a direction: a
 * savings budget counts the same expense items a cap does and differs only in reading as a
 * floor, and pairing those separately would let someone ask for income with a ceiling.
 */
const MEASURES: { value: BudgetMeasures; label: string }[] = [
    { value: "expense", label: "Expenses" },
    { value: "income", label: "Income" },
    { value: "saving", label: "Savings" },
];

const MEASURES_HELP: Record<BudgetMeasures, string> = {
    expense: "Spending in these categories counts against the limit. Going past it is flagged.",
    income: "Income in these categories counts toward the target. Falling short is the warning.",
    saving: "Money you move into these categories counts toward the target. Falling short is the warning.",
};

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
    const overAllocated = directionOf(measures) === "ceiling" && numericAmount > 0 && allocated > numericAmount;
    const isFloor = directionOf(measures) === "floor";

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
    const previewWindowLabel = previewWindow
        ? windowLabel(period, previewWindow.from, previewWindow.to)
        : undefined;

    // The same figure at the other rates, so what was just typed can't be read as a number
    // with no unit. Skips the rate it IS - "$800/mo ≈ $800/mo" helps nobody - and skips
    // quarterly, which is rarely what anyone is comparing against.
    const OWN_SUFFIX: Record<BudgetPeriod, string> = {
        weekly: "wk", monthly: "mo", quarterly: "qtr", yearly: "yr", custom: "",
    };
    const rates = normalizedAmounts(period, numericAmount);
    const rateHint = [
        ["wk", rates.weekly], ["mo", rates.monthly], ["yr", rates.yearly],
    ]
        .filter(([suffix, value]) => suffix !== OWN_SUFFIX[period] && value !== undefined)
        .map(([suffix, value]) => `${formatCurrency(value as number, currency)}/${suffix}`)
        .join(" · ");

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
                    {/* Type comes first: it decides which way the amount points - a
                    ceiling on spending, a floor under income and saving - so every field
                    below reads differently, and picking it last would read backwards. */}
                    <TextField
                        select fullWidth label="Type" value={measures}
                        onChange={(e) => setMeasures(e.target.value as BudgetMeasures)}
                        helperText={MEASURES_HELP[measures]}
                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                    >
                        {MEASURES.map((m) => (
                            <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                        ))}
                    </TextField>

                    {/* Closed, not freeSolo: a budget on a category nothing is filed under
                    silently measures nothing, which is the worst way for this to fail.
                    Categories are registered in Settings and picked here. */}
                    <LabelPicker
                        multiple
                        kind="category"
                        registry={book.categories}
                        value={categories}
                        onChange={setCategories}
                        label="Categories"
                        noOptionsText="No categories left to add"
                        helperText={categories.length === 0 ? "Leave empty to cover every category." : undefined}
                    />

                    {/* Above the amount, deliberately. The amount is a RATE, and the way
                        this form kept producing budgets on the wrong period was letting
                        someone type 800 into an unlabelled money box and only afterwards -
                        a scroll further down - decide what it was 800 of. Reports restate a
                        budget into whatever unit is being viewed, so what is picked here is
                        only ever about when it starts over. */}
                    <TextField
                        select fullWidth label="Resets" value={period}
                        onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
                        helperText={[
                            isFloor
                                ? "How often it starts over. Per-person targets use it too."
                                : "How often it starts over. Per-person limits use it too.",
                            previewWindowLabel ? `Now in ${previewWindowLabel}` : undefined,
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
                            fullWidth disabled label="Starts over on"
                            value={PERIOD_START_HINT[period]}
                        />
                    )}

                    <TextField
                        fullWidth label={isFloor ? "Overall target" : "Overall amount"} value={amount}
                        onChange={(e) => {
                            const clean = sanitizeAmount(e.target.value);
                            if (clean !== null) setAmount(clean);
                        }}
                        helperText={[
                            isFloor
                                ? "The target for everyone together. Leave empty to set targets only for the people below."
                                : "The limit for everyone together. Leave empty to cap only the people below.",
                            rateHint ? `≈ ${rateHint}` : undefined,
                        ].filter(Boolean).join(" · ")}
                        slotProps={{
                            htmlInput: { inputMode: "decimal" },
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        {getCurrencySymbol(currency)}
                                    </InputAdornment>
                                ),
                                // The field reads "$ 800 / month". An amount box with no
                                // visible rate is what had people entering a month's figure
                                // against a yearly period without noticing.
                                endAdornment: period === "custom" ? undefined : (
                                    <InputAdornment position="end">
                                        {`/ ${periodNoun(period)}`}
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />

                    <Box>
                        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                            {isFloor ? "Per-person targets" : "Per-person limits"}
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
                                        sx={{ width: 150, flexShrink: 0 }}
                                        slotProps={{
                                            htmlInput: { inputMode: "decimal" },
                                            input: {
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        {getCurrencySymbol(currency)}
                                                    </InputAdornment>
                                                ),
                                                // Inherits the parent's period, so it is
                                                // just as easy to misread without the rate.
                                                endAdornment: period === "custom" ? undefined : (
                                                    <InputAdornment position="end">
                                                        {`/ ${periodNoun(period)}`}
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
