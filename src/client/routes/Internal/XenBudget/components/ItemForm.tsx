import { useEffect, useState } from "react";
import {
    Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, IconButton, InputAdornment, MenuItem, Stack, Step, StepLabel, Stepper, TextField,
    ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseIcon from "@mui/icons-material/Close";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, XenBudgetItem, ShareType, ItemType, CreateItemInput,
} from "../../../../hooks/xenbudget/types";
import WeightedSplitEditor, { type SplitDraft } from "./WeightedSplitEditor";
import {
    getGroupCurrencies, getCurrencySymbol, sanitizeAmount, STABLE_CURRENCY_MENU_PROPS,
} from "../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { EXPENSE_COLOR, INCOME_COLOR } from "../../../../components/ui/chartColors";

const STEPS = ["Details", "Splits", "More"] as const;

interface ItemFormProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
    /** Present when editing; absent when adding. */
    item?: XenBudgetItem | null;
    onSubmit: (input: CreateItemInput) => Promise<unknown>;
    isSubmitting: boolean;
    onDelete?: () => Promise<unknown>;
    isDeleting?: boolean;
}

export default function ItemForm({
    open, onClose, book, item, onSubmit, isSubmitting, onDelete, isDeleting,
}: ItemFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const isMobile = useMediaQuery("(max-width:600px)");
    const [step, setStep] = useState(0);
    const [type, setType] = useState<ItemType>("expense");
    const [amount, setAmount] = useState("");
    const [currency, setCurrency] = useState(book.default_currency);
    const [date, setDate] = useState<Date | null>(new Date());
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [flags, setFlags] = useState<string[]>([]);
    const [categorySplitType, setCategorySplitType] = useState<ShareType>("equal");
    const [categories, setCategories] = useState<SplitDraft[]>([]);
    const [shareType, setShareType] = useState<ShareType>("equal");
    const [shares, setShares] = useState<SplitDraft[]>([]);

    // A solo book has no one else to attribute against — the picker still shows (so it's
    // visible what this step normally does), just greyed and non-interactive.
    const soloBook = book.members.length <= 1;

    // Re-seed whenever the dialog opens, so a cancelled edit doesn't leak into the next one.
    useEffect(() => {
        if (!open) return;
        setStep(0);
        if (item) {
            setType(item.type);
            setAmount(String(item.amount));
            setCurrency(item.currency);
            setDate(new Date(item.date));
            setDescription(item.description);
            setNotes(item.notes || "");
            setFlags(item.flags || []);
            setCategorySplitType(item.category_split_type || "equal");
            setCategories((item.categories || []).map((c) => ({
                key: c.name,
                value: item.category_split_type === "percent" ? String(c.percentage ?? "") : String(c.amount ?? ""),
            })));
            setShareType(item.share_type);
            setShares(item.shares.map((s) => ({
                key: s.user_id,
                value: item.share_type === "percent" ? String(s.percentage ?? "") : String(s.amount ?? ""),
            })));
        } else {
            setType("expense");
            setAmount("");
            setCurrency(book.default_currency);
            setDate(new Date());
            setDescription("");
            setNotes("");
            setFlags([]);
            setCategorySplitType("equal");
            setCategories([]);
            setShareType("equal");
            // Default to everyone: the common case is a shared household expense.
            setShares(book.members.map((m) => ({ key: m.user_id, value: "" })));
        }
    }, [open, item, book]);

    const numericAmount = parseFloat(amount) || 0;
    const canSubmit = description.trim().length > 0 && numericAmount > 0 && shares.length > 0;
    const canProceed = STEPS[step] === "Details"
        ? description.trim().length > 0 && numericAmount > 0 && shares.length > 0
        : true;
    const typeColor = type === "income" ? INCOME_COLOR : EXPENSE_COLOR;

    const handleSubmit = async () => {
        const input: CreateItemInput = {
            type,
            amount: numericAmount,
            currency,
            date: (date || new Date()).toISOString(),
            description: description.trim(),
            notes: notes.trim() || undefined,
            flags,
            category_split_type: categorySplitType,
            categories: categories.map((c) => ({
                name: c.key,
                ...(categorySplitType === "exact" ? { amount: parseFloat(c.value) || 0 } : {}),
                ...(categorySplitType === "percent" ? { percentage: parseFloat(c.value) || 0 } : {}),
            })),
            share_type: shareType,
            shares: shares.map((s) => ({
                user_id: s.key,
                ...(shareType === "exact" ? { amount: parseFloat(s.value) || 0 } : {}),
                ...(shareType === "percent" ? { percentage: parseFloat(s.value) || 0 } : {}),
            })),
        };
        try {
            await onSubmit(input);
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save item", { variant: "error" });
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        try {
            await onDelete();
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to delete item", { variant: "error" });
        }
    };

    return (
        <Dialog
            open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}
            slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 2 } } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 3, pt: 2 }}>
                <DialogTitle sx={{ fontWeight: 700, p: 0 }}>{item ? "Edit item" : "Add item"}</DialogTitle>
                <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
            </Box>
            <DialogContent>
                <Stepper activeStep={step} sx={{ mb: 2 }}>
                    {STEPS.map((label, i) => (
                        <Step key={label}>
                            <StepLabel
                                onClick={item ? () => setStep(i) : undefined}
                                sx={item ? { cursor: "pointer" } : undefined}
                            >
                                {label}
                            </StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {STEPS[step] === "Details" && (
                    <Stack spacing={2}>
                        <ToggleButtonGroup
                            size="small" exclusive fullWidth value={type}
                            onChange={(_, v) => v && setType(v)}
                        >
                            <ToggleButton
                                value="expense"
                                sx={{
                                    gap: 0.75,
                                    "&.Mui-selected": {
                                        color: EXPENSE_COLOR,
                                        borderColor: EXPENSE_COLOR,
                                        bgcolor: alpha(EXPENSE_COLOR, 0.15),
                                    },
                                    "&.Mui-selected:hover": { bgcolor: alpha(EXPENSE_COLOR, 0.22) },
                                }}
                            >
                                <ArrowDownwardIcon fontSize="small" />
                                Expense
                            </ToggleButton>
                            <ToggleButton
                                value="income"
                                sx={{
                                    gap: 0.75,
                                    "&.Mui-selected": {
                                        color: INCOME_COLOR,
                                        borderColor: INCOME_COLOR,
                                        bgcolor: alpha(INCOME_COLOR, 0.15),
                                    },
                                    "&.Mui-selected:hover": { bgcolor: alpha(INCOME_COLOR, 0.22) },
                                }}
                            >
                                <ArrowUpwardIcon fontSize="small" />
                                Income
                            </ToggleButton>
                        </ToggleButtonGroup>

                        <TextField
                            autoFocus fullWidth label="Description"
                            placeholder={type === "income" ? "Paycheque" : "Groceries"}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />

                        <Stack direction="row" spacing={1}>
                            <TextField
                                label="Amount" value={amount}
                                onChange={(e) => {
                                    const clean = sanitizeAmount(e.target.value);
                                    if (clean !== null) setAmount(clean);
                                }}
                                sx={{ flexGrow: 1 }}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Typography component="span" sx={{ color: typeColor, fontWeight: 600 }}>
                                                    {getCurrencySymbol(currency)}
                                                </Typography>
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                            />
                            <TextField
                                select label="Currency" value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                sx={{ width: 120 }}
                                slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                            >
                                {getGroupCurrencies(book.default_currency, [], currency).map((c) => (
                                    <MenuItem key={c} value={c}>{c}</MenuItem>
                                ))}
                            </TextField>
                        </Stack>

                        <DatePicker label="Date" value={date} onChange={setDate} />

                        <Divider />

                        <Box>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                                Attributed to
                            </Typography>
                            <Box sx={soloBook ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
                                <WeightedSplitEditor
                                    mode={{ kind: "people", members: book.members }}
                                    splitType={shareType}
                                    onSplitTypeChange={setShareType}
                                    selected={shares}
                                    onSelectedChange={setShares}
                                    amount={numericAmount}
                                    currency={currency}
                                    amountless
                                />
                            </Box>
                            {soloBook && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                    Only one person in this book, so there&rsquo;s nothing to split.
                                </Typography>
                            )}
                        </Box>

                        <Divider />

                        <Box>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                                What was it?
                            </Typography>
                            <WeightedSplitEditor
                                mode={{ kind: "categories", registry: book.categories }}
                                splitType={categorySplitType}
                                onSplitTypeChange={setCategorySplitType}
                                selected={categories}
                                onSelectedChange={setCategories}
                                amount={numericAmount}
                                currency={currency}
                                amountless
                            />
                        </Box>
                    </Stack>
                )}

                {STEPS[step] === "Splits" && (
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                                Attributed to
                            </Typography>
                            <Box sx={soloBook ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
                                <WeightedSplitEditor
                                    mode={{ kind: "people", members: book.members }}
                                    splitType={shareType}
                                    onSplitTypeChange={setShareType}
                                    selected={shares}
                                    onSelectedChange={setShares}
                                    amount={numericAmount}
                                    currency={currency}
                                    hidePicker
                                />
                            </Box>
                            {soloBook && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                    Only one person in this book, so there&rsquo;s nothing to split.
                                </Typography>
                            )}
                        </Box>

                        <Divider />

                        <Box>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                                What was it?
                            </Typography>
                            <WeightedSplitEditor
                                mode={{ kind: "categories", registry: book.categories }}
                                splitType={categorySplitType}
                                onSplitTypeChange={setCategorySplitType}
                                selected={categories}
                                onSelectedChange={setCategories}
                                amount={numericAmount}
                                currency={currency}
                                hidePicker
                            />
                        </Box>
                    </Stack>
                )}

                {STEPS[step] === "More" && (
                    <Stack spacing={2}>
                        <Autocomplete
                            multiple freeSolo
                            options={book.flags.map((t) => t.name)}
                            value={flags}
                            onChange={(_, v) => setFlags(v as string[])}
                            renderTags={(value, getTagProps) =>
                                value.map((option, index) => {
                                    const { key, ...rest } = getTagProps({ index });
                                    return <Chip key={key} size="small" variant="outlined" label={option} {...rest} />;
                                })
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params} label="Flags" placeholder="Anything needing attention?"
                                    helperText="For things to come back to — not what the purchase was."
                                />
                            )}
                        />

                        <TextField
                            fullWidth multiline minRows={2} label="Notes (optional)"
                            value={notes} onChange={(e) => setNotes(e.target.value)}
                        />
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Stack direction="row" spacing={1} sx={{ mr: "auto" }}>
                    {item && onDelete && (
                        <Button color="error" disabled={isDeleting} onClick={handleDelete}>
                            Delete
                        </Button>
                    )}
                    {step > 0 && <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
                </Stack>
                {(item || step === STEPS.length - 1) && (
                    <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                        Save
                    </Button>
                )}
                {step < STEPS.length - 1 && (
                    <Button variant="outlined" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
                        Next
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
