import { useEffect, useState } from "react";
import {
    Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Stack, TextField,
    ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, XenBudgetRule, XenBudgetRuleCondition, RuleInput, RuleField, RuleOp,
    RuleDisposition,
} from "../../../../hooks/xenbudget/types";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";

const FIELDS: { value: RuleField; label: string }[] = [
    { value: "description", label: "Description" },
    { value: "amount", label: "Amount" },
    { value: "category", label: "Category" },
    { value: "flags", label: "Flags" },
    { value: "type", label: "Type" },
    { value: "date", label: "Date" },
    { value: "source", label: "Source" },
];

// Which operators make sense for which field — offering "starts with" on an amount, or
// "greater than" on a description, only invites rules that can never match.
const OPS_BY_FIELD: Record<RuleField, { value: RuleOp; label: string }[]> = {
    description: [
        { value: "contains", label: "contains" },
        { value: "not_contains", label: "does not contain" },
        { value: "equals", label: "is exactly" },
        { value: "starts_with", label: "starts with" },
        { value: "ends_with", label: "ends with" },
        { value: "regex", label: "matches regex" },
        { value: "is_empty", label: "is empty" },
    ],
    amount: [
        { value: "gt", label: "is more than" },
        { value: "gte", label: "is at least" },
        { value: "lt", label: "is less than" },
        { value: "lte", label: "is at most" },
        { value: "equals", label: "is exactly" },
        { value: "between", label: "is between" },
    ],
    flags: [
        { value: "contains", label: "includes" },
        { value: "not_contains", label: "does not include" },
        { value: "is_empty", label: "is empty" },
    ],
    category: [
        { value: "contains", label: "is" },
        { value: "not_contains", label: "is not" },
        { value: "is_empty", label: "is empty" },
    ],
    type: [{ value: "equals", label: "is" }],
    date: [
        { value: "gte", label: "is on or after" },
        { value: "lte", label: "is on or before" },
        { value: "between", label: "is between" },
    ],
    source: [{ value: "equals", label: "is" }],
};

const DISPOSITIONS: { value: RuleDisposition; label: string; help: string }[] = [
    { value: "keep", label: "Keep", help: "Counts normally." },
    { value: "exclude", label: "Exclude from totals", help: "Still listed, greyed out, and reversible — but never counted. Best for internal transfers." },
    { value: "skip", label: "Never import", help: "Matching rows are not saved at all. Import reports how many were dropped and why." },
];

const emptyCondition = (): XenBudgetRuleCondition => ({ field: "description", op: "contains", value: "" });

interface RuleFormProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
    rule?: XenBudgetRule | null;
    onSubmit: (input: RuleInput) => Promise<unknown>;
    isSubmitting: boolean;
    onDelete?: () => Promise<unknown>;
}

export default function RuleForm({
    open, onClose, book, rule, onSubmit, isSubmitting, onDelete,
}: RuleFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const [name, setName] = useState("");
    const [mode, setMode] = useState<"all" | "any">("all");
    const [conditions, setConditions] = useState<XenBudgetRuleCondition[]>([emptyCondition()]);
    const [setCategories, setSetCategories] = useState<string[]>([]);
    const [addFlags, setAddFlags] = useState<string[]>([]);
    const [setType, setSetType] = useState<"" | "expense" | "income">("");
    const [setDescription, setSetDescription] = useState("");
    const [disposition, setDisposition] = useState<RuleDisposition>("keep");
    const [stopOnMatch, setStopOnMatch] = useState(false);
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (!open) return;
        if (rule) {
            setName(rule.name);
            setMode(rule.match.mode || "all");
            setConditions(rule.match.conditions.length ? rule.match.conditions : [emptyCondition()]);
            setSetCategories(rule.actions.set_categories || []);
            setAddFlags(rule.actions.add_flags || []);
            setSetType(rule.actions.set_type || "");
            setSetDescription(rule.actions.set_description || "");
            setDisposition(rule.actions.disposition || "keep");
            setStopOnMatch(!!rule.stop_on_match);
            setEnabled(rule.enabled !== false);
        } else {
            setName("");
            setMode("all");
            setConditions([emptyCondition()]);
            setSetCategories([]);
            setAddFlags([]);
            setSetType("");
            setSetDescription("");
            setDisposition("keep");
            setStopOnMatch(false);
            setEnabled(true);
        }
    }, [open, rule]);

    const updateCondition = (index: number, patch: Partial<XenBudgetRuleCondition>) => {
        setConditions((prev) => prev.map((c, i) => {
            if (i !== index) return c;
            const next = { ...c, ...patch };
            // Changing the field can strand an operator the new field doesn't support.
            if (patch.field && !OPS_BY_FIELD[patch.field].some((o) => o.value === next.op)) {
                next.op = OPS_BY_FIELD[patch.field][0].value;
            }
            return next;
        }));
    };

    const conditionsValid = conditions.every(
        (c) => c.op === "is_empty" || ((c.value ?? "") !== "" && (c.op !== "between" || (c.value2 ?? "") !== "")),
    );
    const doesSomething = setCategories.length > 0 || addFlags.length > 0 || !!setType
        || !!setDescription.trim() || disposition !== "keep";
    const canSubmit = !!name.trim() && conditions.length > 0 && conditionsValid && doesSomething;

    const handleSubmit = async () => {
        try {
            await onSubmit({
                name: name.trim(),
                enabled,
                match: { mode, conditions },
                actions: {
                    set_categories: setCategories,
                    add_flags: addFlags,
                    set_type: setType || null,
                    set_description: setDescription.trim() || undefined,
                    disposition,
                },
                stop_on_match: stopOnMatch,
            });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save rule", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        autoFocus fullWidth label="Rule name" placeholder="Internal transfers"
                        value={name} onChange={(e) => setName(e.target.value)}
                        helperText="Shown on any item this rule excludes or flags."
                    />

                    <Divider />

                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={sectionLabelSx}>When</Typography>
                            <ToggleButtonGroup
                                size="small" exclusive value={mode}
                                onChange={(_, v) => v && setMode(v)}
                            >
                                <ToggleButton value="all">all match</ToggleButton>
                                <ToggleButton value="any">any match</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>

                        <Stack spacing={1}>
                            {conditions.map((cond, index) => (
                                <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
                                    <TextField
                                        select size="small" label="Field" value={cond.field}
                                        onChange={(e) => updateCondition(index, { field: e.target.value as RuleField })}
                                        sx={{ width: 130 }}
                                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                                    >
                                        {FIELDS.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                                    </TextField>
                                    <TextField
                                        select size="small" label="Is" value={cond.op}
                                        onChange={(e) => updateCondition(index, { op: e.target.value as RuleOp })}
                                        sx={{ width: 160 }}
                                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                                    >
                                        {OPS_BY_FIELD[cond.field].map((o) => (
                                            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                        ))}
                                    </TextField>
                                    {cond.op !== "is_empty" && (
                                        <TextField
                                            size="small" label="Value" value={cond.value ?? ""}
                                            onChange={(e) => updateCondition(index, { value: e.target.value })}
                                            sx={{ flexGrow: 1 }}
                                        />
                                    )}
                                    {cond.op === "between" && (
                                        <TextField
                                            size="small" label="And" value={cond.value2 ?? ""}
                                            onChange={(e) => updateCondition(index, { value2: e.target.value })}
                                            sx={{ width: 120 }}
                                        />
                                    )}
                                    <IconButton
                                        size="small" disabled={conditions.length === 1}
                                        onClick={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}
                        </Stack>
                        <Button
                            size="small" startIcon={<AddIcon />} sx={{ mt: 1 }}
                            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
                        >
                            Add condition
                        </Button>
                    </Box>

                    <Divider />

                    <Box>
                        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Then</Typography>
                        <Stack spacing={2}>
                            <Autocomplete
                                multiple freeSolo
                                options={book.categories.map((c) => c.name)}
                                value={setCategories}
                                onChange={(_, v) => setSetCategories(v as string[])}
                                renderTags={(value, getTagProps) =>
                                    value.map((option, index) => {
                                        const { key, ...rest } = getTagProps({ index });
                                        return <Chip key={key} size="small" label={option} {...rest} />;
                                    })
                                }
                                renderInput={(params) => (
                                    <TextField
                                        {...params} size="small" label="Set category"
                                        helperText="Replaces whatever the item had. Two categories split it evenly."
                                    />
                                )}
                            />

                            <Autocomplete
                                multiple freeSolo
                                options={book.flags.map((t) => t.name)}
                                value={addFlags}
                                onChange={(_, v) => setAddFlags(v as string[])}
                                renderTags={(value, getTagProps) =>
                                    value.map((option, index) => {
                                        const { key, ...rest } = getTagProps({ index });
                                        return <Chip key={key} size="small" variant="outlined" label={option} {...rest} />;
                                    })
                                }
                                renderInput={(params) => (
                                    <TextField
                                        {...params} size="small" label="Add flags"
                                        helperText="For attention, e.g. Needs review."
                                    />
                                )}
                            />

                            <Stack direction="row" spacing={1}>
                                <TextField
                                    select size="small" label="Set type" value={setType}
                                    onChange={(e) => setSetType(e.target.value as "" | "expense" | "income")}
                                    sx={{ width: 150 }}
                                    slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                                >
                                    <MenuItem value="">Leave alone</MenuItem>
                                    <MenuItem value="expense">Expense</MenuItem>
                                    <MenuItem value="income">Income</MenuItem>
                                </TextField>
                                <TextField
                                    size="small" label="Rename to" value={setDescription}
                                    onChange={(e) => setSetDescription(e.target.value)}
                                    placeholder="Leave blank to keep"
                                    sx={{ flexGrow: 1 }}
                                />
                            </Stack>

                            <TextField
                                select fullWidth size="small" label="Disposition" value={disposition}
                                onChange={(e) => setDisposition(e.target.value as RuleDisposition)}
                                helperText={DISPOSITIONS.find((d) => d.value === disposition)?.help}
                                slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                            >
                                {DISPOSITIONS.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
                            </TextField>
                        </Stack>
                    </Box>

                    <Divider />

                    <Stack>
                        <FormControlLabel
                            control={<Checkbox size="small" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                            label="Enabled"
                        />
                        <FormControlLabel
                            control={<Checkbox size="small" checked={stopOnMatch} onChange={(e) => setStopOnMatch(e.target.checked)} />}
                            label="Stop processing later rules when this one matches"
                        />
                    </Stack>

                    {!doesSomething && (
                        <Typography variant="caption" color="warning.main">
                            This rule doesn&rsquo;t do anything yet — set a category, add a flag, or pick a disposition.
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                {rule && onDelete && (
                    <Button
                        color="error" sx={{ mr: "auto" }}
                        onClick={async () => {
                            try {
                                await onDelete();
                                onClose();
                            } catch (e) {
                                enqueueSnackbar(e instanceof Error ? e.message : "Failed to delete rule", { variant: "error" });
                            }
                        }}
                    >
                        Delete
                    </Button>
                )}
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                    {rule ? "Save" : "Create"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
