import { useEffect, useState } from "react";
import {
    Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup,
    Typography,
} from "@mui/material";
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

    // Re-seed whenever the dialog opens, so a cancelled edit doesn't leak into the next one.
    useEffect(() => {
        if (!open) return;
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

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <ToggleButtonGroup
                        size="small" exclusive fullWidth value={type}
                        onChange={(_, v) => v && setType(v)}
                    >
                        <ToggleButton value="expense">Expense</ToggleButton>
                        <ToggleButton value="income">Income</ToggleButton>
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
                                        <InputAdornment position="start">{getCurrencySymbol(currency)}</InputAdornment>
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
                        />
                    </Box>

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

                    <Divider />

                    <Box>
                        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                            Attributed to
                        </Typography>
                        <WeightedSplitEditor
                            mode={{ kind: "people", members: book.members }}
                            splitType={shareType}
                            onSplitTypeChange={setShareType}
                            selected={shares}
                            onSelectedChange={setShares}
                            amount={numericAmount}
                            currency={currency}
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                {item && onDelete && (
                    <Button
                        color="error" disabled={isDeleting}
                        onClick={async () => {
                            try {
                                await onDelete();
                                onClose();
                            } catch (e) {
                                enqueueSnackbar(e instanceof Error ? e.message : "Failed to delete item", { variant: "error" });
                            }
                        }}
                        sx={{ mr: "auto" }}
                    >
                        Delete
                    </Button>
                )}
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                    {item ? "Save" : "Add"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
