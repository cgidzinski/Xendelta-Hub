import {
    Autocomplete, Avatar, Box, Checkbox, InputAdornment, Stack, TextField, ToggleButton,
    ToggleButtonGroup, Typography,
} from "@mui/material";
import type { ShareType, XenBudgetMember, XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { formatCurrency, getCurrencySymbol, sanitizeAmount } from "../../../../utils/currencyUtils";
import { resolveLabelColor } from "./LabelChip";

export interface SplitDraft {
    key: string;
    /** Raw text, so a half-typed "12." isn't clobbered mid-keystroke. */
    value: string;
}

interface WeightedSplitEditorProps {
    splitType: ShareType;
    onSplitTypeChange: (t: ShareType) => void;
    selected: SplitDraft[];
    onSelectedChange: (s: SplitDraft[]) => void;
    amount: number;
    currency: string;
    /**
     * People come from a fixed roster you tick; categories are free text you can invent
     * on the spot. Everything else about the two is identical.
     */
    mode: { kind: "people"; members: XenBudgetMember[] }
    | { kind: "categories"; registry: XenBudgetLabel[] };
    /**
     * For pickers with no single amount to divide — the CSV import's default owners apply
     * to every row at once. The split-type toggle and the per-part money are suppressed,
     * since neither means anything without an amount.
     */
    amountless?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Divides an item's amount across people or across categories.
 *
 * One component for both because they are the same problem, entered the same way, and
 * backed by the same resolver on the server. The running total is the point: both sets of
 * weights are summed independently by aggregations, so a split that doesn't add up would
 * quietly put the per-person or per-category figures out of step with the book total.
 */
export default function WeightedSplitEditor({
    splitType, onSplitTypeChange, selected, onSelectedChange, amount, currency, mode,
    amountless = false,
}: WeightedSplitEditorProps) {
    const keys = selected.map((s) => s.key);

    const toggle = (key: string) => {
        if (keys.includes(key)) onSelectedChange(selected.filter((s) => s.key !== key));
        else onSelectedChange([...selected, { key, value: "" }]);
    };

    const setValue = (key: string, raw: string) => {
        const clean = sanitizeAmount(raw);
        if (clean === null) return;
        onSelectedChange(selected.map((s) => (s.key === key ? { ...s, value: clean } : s)));
    };

    const entered = selected.reduce((acc, s) => acc + (parseFloat(s.value) || 0), 0);
    const perPart = selected.length > 0 ? amount / selected.length : 0;

    const noun = mode.kind === "people" ? "person" : "category";
    const summary = (() => {
        if (amountless) {
            if (selected.length === 0) return { text: "Pick at least one person", error: true };
            return {
                text: selected.length === 1 ? "All rows attributed to them" : `Split evenly between ${selected.length}`,
                error: false,
            };
        }
        if (selected.length === 0) {
            return mode.kind === "people"
                ? { text: "Pick at least one person", error: true }
                // An uncategorised item is a legitimate state, not an error — it's exactly
                // what the importer leaves behind for you to work through.
                : { text: "Uncategorised", error: false };
        }
        if (splitType === "equal") return { text: `${formatCurrency(round2(perPart), currency)} each`, error: false };
        if (splitType === "percent") {
            const diff = round2(100 - entered);
            if (Math.abs(diff) < 0.01) return { text: "100% allocated", error: false };
            return { text: diff > 0 ? `${round2(diff)}% left to allocate` : `${round2(-diff)}% over`, error: true };
        }
        const diff = round2(amount - entered);
        if (Math.abs(diff) < 0.01) return { text: "Fully allocated", error: false };
        return {
            text: diff > 0
                ? `${formatCurrency(diff, currency)} left to allocate`
                : `${formatCurrency(-diff, currency)} over`,
            error: true,
        };
    })();

    const valueField = (draft: SplitDraft) => (
        <TextField
            size="small" value={draft.value}
            onChange={(e) => setValue(draft.key, e.target.value)}
            sx={{ width: 120 }}
            slotProps={{
                input: splitType === "percent"
                    ? { endAdornment: <InputAdornment position="end">%</InputAdornment> }
                    : { startAdornment: <InputAdornment position="start">{getCurrencySymbol(currency)}</InputAdornment> },
            }}
        />
    );

    return (
        <Box>
            {!amountless && (
                <ToggleButtonGroup
                    size="small" exclusive fullWidth value={splitType}
                    onChange={(_, v) => v && onSplitTypeChange(v)}
                    sx={{ mb: 1 }}
                >
                    <ToggleButton value="equal">Split evenly</ToggleButton>
                    <ToggleButton value="exact">Exact amounts</ToggleButton>
                    <ToggleButton value="percent">Percentages</ToggleButton>
                </ToggleButtonGroup>
            )}

            {mode.kind === "people" ? (
                <Stack spacing={0.5}>
                    {mode.members.map((m) => {
                        const draft = selected.find((s) => s.key === m.user_id);
                        return (
                            <Stack key={m.user_id} direction="row" alignItems="center" spacing={1}>
                                <Checkbox size="small" checked={!!draft} onChange={() => toggle(m.user_id)} />
                                <Avatar src={m.avatar || undefined} sx={{ width: 26, height: 26, fontSize: 12 }}>
                                    {m.username[0]?.toUpperCase()}
                                </Avatar>
                                <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                                    {m.username}
                                </Typography>
                                {draft && !amountless && splitType === "equal" && (
                                    <Typography variant="body2" color="text.secondary">
                                        {formatCurrency(round2(perPart), currency)}
                                    </Typography>
                                )}
                                {draft && !amountless && splitType !== "equal" && valueField(draft)}
                            </Stack>
                        );
                    })}
                </Stack>
            ) : (
                <Stack spacing={1}>
                    <Autocomplete
                        multiple freeSolo
                        options={mode.registry.map((c) => c.name)}
                        value={keys}
                        onChange={(_, v) => {
                            const next = v as string[];
                            // Keep any weight already typed for a category that survives.
                            onSelectedChange(next.map((key) =>
                                selected.find((s) => s.key === key) || { key, value: "" }));
                        }}
                        renderInput={(params) => (
                            <TextField {...params} size="small" label="Categories" placeholder="What was this?" />
                        )}
                    />
                    {splitType !== "equal" && selected.map((draft) => (
                        <Stack key={draft.key} direction="row" alignItems="center" spacing={1}>
                            <Box sx={{
                                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                bgcolor: resolveLabelColor(draft.key, mode.registry),
                            }} />
                            <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                                {draft.key}
                            </Typography>
                            {valueField(draft)}
                        </Stack>
                    ))}
                    {splitType === "equal" && selected.length > 1 && (
                        <Typography variant="caption" color="text.secondary">
                            {formatCurrency(round2(perPart), currency)} to each {noun}
                        </Typography>
                    )}
                </Stack>
            )}

            <Typography
                variant="caption"
                color={summary.error ? "warning.main" : "text.secondary"}
                sx={{ display: "block", mt: 1 }}
            >
                {summary.text}
            </Typography>
        </Box>
    );
}
