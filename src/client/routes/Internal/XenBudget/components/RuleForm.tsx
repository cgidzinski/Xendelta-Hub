import { useEffect, useMemo, useState } from "react";
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Button, Checkbox, Chip, CircularProgress,
    Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
    MenuItem, Radio, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, XenBudgetRule, XenBudgetRuleCondition, RuleInput, RuleField, RuleOp,
    RuleDisposition, ShareType,
} from "../../../../hooks/xenbudget/types";
import WeightedSplitEditor, { type SplitDraft } from "./WeightedSplitEditor";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { useXenBudgetRules, type RulePreviewMatch } from "../../../../hooks/xenbudget/useRules";
import { formatCurrency } from "../currency";

// Outlined, slightly darker panel used to group each subsection of the form.
const groupSx = {
    border: "1px solid",
    borderColor: "divider",
    borderRadius: 2,
    p: 2,
    bgcolor: "background.default",
} satisfies SxProps<Theme>;

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

/** Auto-generated name: just the positive match — the target categories already show as
 *  chips on the rule card, so repeating them in the name is redundant. */
function generateRuleName(conditions: XenBudgetRuleCondition[]): string {
    const value = conditions.find(
        (c) => c.field === "description" && c.op === "contains" && (c.value ?? "").trim(),
    )?.value?.trim()
        ?? conditions.find((c) => c.field === "description" && (c.value ?? "").trim())?.value?.trim()
        ?? "";
    return value;
}

interface RuleFormProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
    /** An existing rule to edit, or a suggestion's RuleInput to prefill before creating. */
    rule?: XenBudgetRule | RuleInput | null;
    onSubmit: (input: RuleInput) => Promise<unknown>;
    isSubmitting: boolean;
    onDelete?: () => Promise<unknown>;
}

export default function RuleForm({
    open, onClose, book, rule, onSubmit, isSubmitting, onDelete,
}: RuleFormProps) {
    const { enqueueSnackbar } = useSnackbar();
    const { previewRuleAsync, isPreviewingRule } = useXenBudgetRules(book._id);
    const isMobile = useMediaQuery("(max-width:600px)");
    const [name, setName] = useState("");
    const [mode, setMode] = useState<"all" | "any">("all");
    // Simple "contains" / "does not contain" fields; blank ones are ignored on submit.
    const [contains, setContains] = useState("");
    const [notContains, setNotContains] = useState("");
    const [advancedOpen, setAdvancedOpen] = useState(false);
    // Advanced conditions, only created when the user opens the accordion.
    const [conditions, setConditions] = useState<XenBudgetRuleCondition[]>([]);
    const [categories, setCategories] = useState<SplitDraft[]>([]);
    const [categorySplitType, setCategorySplitType] = useState<ShareType>("equal");
    const [addFlags, setAddFlags] = useState<string[]>([]);
    const [setType, setSetType] = useState<"" | "expense" | "income">("");
    const [setDescription, setSetDescription] = useState("");
    const [disposition, setDisposition] = useState<RuleDisposition>("keep");
    const [stopOnMatch, setStopOnMatch] = useState(false);
    const [enabled, setEnabled] = useState(true);
    // Once the user types in the name themselves, stop auto-generating it.
    const [nameTouched, setNameTouched] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewMatches, setPreviewMatches] = useState<RulePreviewMatch[]>([]);

    // The full match list: the two simple fields (blank = ignored) plus any advanced
    // conditions. This is what gets validated and submitted.
    const allConditions = useMemo(() => {
        const list: XenBudgetRuleCondition[] = [];
        if (contains.trim()) list.push({ field: "description", op: "contains", value: contains.trim() });
        if (notContains.trim()) list.push({ field: "description", op: "not_contains", value: notContains.trim() });
        list.push(...conditions);
        return list;
    }, [contains, notContains, conditions]);

    useEffect(() => {
        if (!open) return;
        // Editing a saved rule keeps its name; creating one auto-generates as you go.
        setNameTouched(!!rule && "_id" in rule);
        if (rule) {
            setName(rule.name);
            setMode(rule.match.mode || "all");
            const source = rule.match.conditions || [];
            const containsCond = source.find((c) => c.field === "description" && c.op === "contains");
            const notContainsCond = source.find((c) => c.field === "description" && c.op === "not_contains");
            setContains(containsCond?.value ?? "");
            setNotContains(notContainsCond?.value ?? "");
            const advanced = source.filter((c) => c !== containsCond && c !== notContainsCond);
            setConditions(advanced);
            setAdvancedOpen(advanced.length > 0);
            setCategories((rule.actions.set_categories || []).map((name) => {
                const weight = (rule.actions.set_category_weights || []).find((w) => w.name === name);
                return { key: name, value: weight?.percentage !== undefined ? String(weight.percentage) : "" };
            }));
            setCategorySplitType(rule.actions.category_split_type === "percent" ? "percent" : "equal");
            setAddFlags(rule.actions.add_flags || []);
            setSetType(rule.actions.set_type || "");
            setSetDescription(rule.actions.set_description || "");
            setDisposition(rule.actions.disposition || "keep");
            setStopOnMatch(!!rule.stop_on_match);
            setEnabled(rule.enabled !== false);
        } else {
            setName("");
            setMode("all");
            setContains("");
            setNotContains("");
            setConditions([]);
            setAdvancedOpen(false);
            setCategories([]);
            setCategorySplitType("equal");
            setAddFlags([]);
            setSetType("");
            setSetDescription("");
            setDisposition("keep");
            setStopOnMatch(false);
            setEnabled(true);
        }
    }, [open, rule]);

    // Auto-generate the name from the conditions while it hasn't been manually edited.
    useEffect(() => {
        if (!open || nameTouched) return;
        setName(generateRuleName(allConditions));
    }, [open, nameTouched, allConditions]);

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

    const conditionsValid = allConditions.every(
        (c) => c.op === "is_empty" || ((c.value ?? "") !== "" && (c.op !== "between" || (c.value2 ?? "") !== "")),
    );
    const doesSomething = categories.length > 0 || addFlags.length > 0 || !!setType
        || !!setDescription.trim() || disposition !== "keep";
    const canSubmit = !!name.trim() && allConditions.length > 0 && conditionsValid && doesSomething;

    // The rule as the API wants it, whether it's being saved or previewed.
    const buildInput = (): RuleInput => ({
        name: name.trim() || "preview",
        enabled,
        match: { mode, conditions: allConditions },
        actions: {
            set_categories: categories.map((c) => c.key),
            category_split_type: categories.length >= 2 && categorySplitType === "percent"
                ? "percent"
                : "equal",
            set_category_weights: categories.length >= 2 && categorySplitType === "percent"
                ? categories.map((c) => ({ name: c.key, percentage: parseFloat(c.value) || 0 }))
                : [],
            add_flags: addFlags,
            set_type: setType || null,
            set_description: setDescription.trim() || undefined,
            disposition,
        },
        stop_on_match: stopOnMatch,
    });

    const handleSubmit = async () => {
        try {
            await onSubmit(buildInput());
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save rule", { variant: "error" });
        }
    };

    const openPreview = async () => {
        try {
            setPreviewMatches([]);
            setPreviewOpen(true);
            const ruleId = rule && "_id" in rule ? rule._id : undefined;
            const data = await previewRuleAsync({ input: buildInput(), ruleId });
            setPreviewMatches(data.matches);
        } catch (e) {
            setPreviewOpen(false);
            enqueueSnackbar(e instanceof Error ? e.message : "Could not preview rule", { variant: "error" });
        }
    };

    return (
        <>
            <Dialog
                open={open} onClose={onClose} fullWidth maxWidth="sm"
                fullScreen={isMobile}
                slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 2 } } }}
            >
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {rule ? "Edit rule" : "New rule"}
                    <IconButton size="small" onClick={onClose} sx={{ mr: -1 }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Box sx={groupSx}>
                            <TextField
                                autoFocus fullWidth label="Rule name" placeholder="Internal transfers"
                                value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
                            />
                        </Box>

                        <Box sx={groupSx}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>When</Typography>
                            <Stack spacing={1}>
                                <TextField
                                    size="small" fullWidth label="Description contains"
                                    value={contains} onChange={(e) => setContains(e.target.value)}
                                    placeholder='e.g. "SLEEMAN"'
                                />
                                <TextField
                                    size="small" fullWidth label="Description doesn't contain"
                                    value={notContains} onChange={(e) => setNotContains(e.target.value)}
                                    placeholder='e.g. "GAS"'
                                />
                            </Stack>

                            <Accordion
                                elevation={0}
                                disableGutters
                                expanded={advancedOpen}
                                onChange={(_, expanded) => setAdvancedOpen(expanded)}
                                sx={{
                                    mt: 1,
                                    "&:before": { display: "none" },
                                    border: "1px solid",
                                    borderColor: "divider",
                                    borderRadius: 1,
                                    bgcolor: "action.hover",
                                }}
                            >
                                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5 }}>
                                    <Typography variant="body2">Advanced</Typography>
                                </AccordionSummary>
                                <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
                                    <Stack spacing={1.5}>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Typography variant="caption" color="text.secondary">Match</Typography>
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
                                                <Box key={index} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
                                                    <Stack direction="row" spacing={1} alignItems="center">
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
                                                            sx={{ width: 170 }}
                                                            slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                                                        >
                                                            {OPS_BY_FIELD[cond.field].map((o) => (
                                                                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                                            ))}
                                                        </TextField>
                                                        <IconButton
                                                            size="small" sx={{ ml: "auto" }}
                                                            onClick={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Stack>
                                                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
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
                                                                sx={{ width: 140 }}
                                                            />
                                                        )}
                                                    </Stack>
                                                </Box>
                                            ))}
                                            {conditions.length === 0 && (
                                                <Typography variant="caption" color="text.secondary">
                                                    No advanced conditions — the simple fields above are enough.
                                                </Typography>
                                            )}
                                        </Stack>

                                        <Button
                                            size="small" startIcon={<AddIcon />}
                                            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
                                        >
                                            Add condition
                                        </Button>
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>
                        </Box>

                        <Box sx={groupSx}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Set category</Typography>
                            <WeightedSplitEditor
                                mode={{ kind: "categories", registry: book.categories }}
                                splitType={categorySplitType}
                                onSplitTypeChange={setCategorySplitType}
                                selected={categories}
                                onSelectedChange={setCategories}
                                amount={0}
                                currency={book.default_currency}
                                noAmount
                            />
                        </Box>

                        <Box sx={groupSx}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Add flags</Typography>
                            <Stack spacing={0.5}>
                                {book.flags.map((flag) => {
                                    const checked = addFlags.includes(flag.name);
                                    return (
                                        <FormControlLabel
                                            key={flag._id}
                                            control={
                                                <Checkbox
                                                    size="small" checked={checked}
                                                    onChange={() => setAddFlags((prev) =>
                                                        checked ? prev.filter((t) => t !== flag.name) : [...prev, flag.name])}
                                                />
                                            }
                                            label={flag.name}
                                        />
                                    );
                                })}
                            </Stack>
                        </Box>

                        <Box sx={groupSx}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Set type</Typography>
                            <Stack spacing={0.5}>
                                <FormControlLabel
                                    control={<Radio size="small" checked={setType === ""} onChange={() => setSetType("")} />}
                                    label="Keep same"
                                />
                                <FormControlLabel
                                    control={<Radio size="small" checked={setType === "expense"} onChange={() => setSetType("expense")} />}
                                    label="Expense"
                                />
                                <FormControlLabel
                                    control={<Radio size="small" checked={setType === "income"} onChange={() => setSetType("income")} />}
                                    label="Income"
                                />
                            </Stack>
                        </Box>

                        <Box sx={groupSx}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Disposition</Typography>
                            <Stack spacing={0.5}>
                                {DISPOSITIONS.map((d) => (
                                    <FormControlLabel
                                        key={d.value}
                                        control={<Radio size="small" checked={disposition === d.value} onChange={() => setDisposition(d.value)} />}
                                        label={d.label}
                                    />
                                ))}
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                                {DISPOSITIONS.find((d) => d.value === disposition)?.help}
                            </Typography>
                        </Box>

                        <Box sx={groupSx}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Rename</Typography>
                            <TextField
                                size="small" fullWidth value={setDescription}
                                onChange={(e) => setSetDescription(e.target.value)}
                                placeholder="Leave blank to keep"
                            />
                        </Box>

                        <Box sx={groupSx}>
                            <FormControlLabel
                                control={<Checkbox size="small" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                                label="Enabled"
                            />
                            <FormControlLabel
                                control={<Checkbox size="small" checked={stopOnMatch} onChange={(e) => setStopOnMatch(e.target.checked)} />}
                                label="Stop processing later rules when this one matches"
                            />
                        </Box>

                        {!doesSomething && (
                            <Typography variant="caption" color="warning.main">
                                This rule doesn&rsquo;t do anything yet — set a category, add a flag, or pick a disposition.
                            </Typography>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Stack direction="row" spacing={1} sx={{ mr: "auto" }}>
                        <Button
                            variant="outlined" disabled={allConditions.length === 0 || !conditionsValid}
                            onClick={openPreview}
                        >
                            Preview
                        </Button>
                        {rule && onDelete && (
                            <Button
                                color="error"
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
                    </Stack>
                    <Button variant="contained" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                        {rule ? "Save" : "Create"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Rule preview
                    <IconButton size="small" onClick={() => setPreviewOpen(false)} sx={{ mr: -1 }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {isPreviewingRule ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : previewMatches.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            No transactions match this rule.
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary">
                                {previewMatches.length === 10
                                    ? "Showing the 10 most recent matches"
                                    : `${previewMatches.length} match${previewMatches.length === 1 ? "" : "es"}`}
                            </Typography>
                            {previewMatches.map((m) => (
                                <Box key={m._id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                                            {m.description}
                                        </Typography>
                                        {m.already_tagged && (
                                            <Chip size="small" variant="outlined" label="tagged" sx={{ height: 20, fontSize: 11 }} />
                                        )}
                                        <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0, color: m.type === "income" ? "success.main" : "error.main" }}>
                                            {m.type === "income" ? "+" : "−"}{formatCurrency(m.amount, m.currency)}
                                        </Typography>
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
