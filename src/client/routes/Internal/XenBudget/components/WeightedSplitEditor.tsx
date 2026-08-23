import {
    Autocomplete, Avatar, Box, InputAdornment, Stack, TextField, ToggleButton,
    ToggleButtonGroup, Typography,
} from "@mui/material";
import type { ShareType, XenBudgetMember, XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { formatCurrency, getCurrencySymbol } from "../currency";
import { sanitizeAmount } from "../../../../utils/currencyUtils";
import { CategoryChip, resolveLabelColor } from "./LabelChip";

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
    /**
     * Renders only rows already in `selected`, with no checkbox/`Autocomplete` to change
     * who or what is included — for a second "now configure the split" step that follows a
     * dedicated picker step, so the same people/categories aren't picked twice.
     */
    hidePicker?: boolean;
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
    amountless = false, hidePicker = false,
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
            if (selected.length === 0) {
                return mode.kind === "people"
                    ? { text: "Pick at least one person", error: true }
                    : { text: "Uncategorised", error: false };
            }
            if (selected.length === 1) {
                return { text: "", error: false };
            }
            return {
                text: `Split evenly between ${selected.length} ${mode.kind === "people" ? "people" : "categories"}`,
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
                hidePicker ? (
                    <Stack spacing={0.5}>
                        {mode.members.filter((m) => keys.includes(m.user_id)).map((m) => {
                            const draft = selected.find((s) => s.key === m.user_id);
                            return (
                                <Stack key={m.user_id} direction="row" alignItems="center" spacing={1}>
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
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                            {mode.members.map((m) => {
                                const isSelected = keys.includes(m.user_id);
                                return (
                                    <Box
                                        key={m.user_id}
                                        onClick={() => toggle(m.user_id)}
                                        sx={{
                                            display: "flex", alignItems: "center", gap: 1,
                                            px: 1.5, py: 0.75, borderRadius: 2, cursor: "pointer",
                                            bgcolor: "action.hover", color: "text.primary",
                                            border: isSelected ? "2px solid" : "2px solid transparent",
                                            borderColor: isSelected ? "primary.main" : "transparent",
                                            transition: "all 0.2s",
                                        }}
                                    >
                                        <Avatar src={m.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                                            {m.username[0]?.toUpperCase()}
                                        </Avatar>
                                        <Typography variant="caption">{m.username}</Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                        {!amountless && splitType !== "equal" && selected.map((draft) => {
                            const m = mode.members.find((mm) => mm.user_id === draft.key);
                            return (
                                <Stack key={draft.key} direction="row" alignItems="center" spacing={1}>
                                    <Avatar src={m?.avatar || undefined} sx={{ width: 26, height: 26, fontSize: 12 }}>
                                        {m?.username[0]?.toUpperCase()}
                                    </Avatar>
                                    <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                                        {m?.username ?? draft.key}
                                    </Typography>
                                    {valueField(draft)}
                                </Stack>
                            );
                        })}
                    </Stack>
                )
            ) : (
                <Stack spacing={1}>
                    {!hidePicker && (
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
                            renderTags={(value, getTagProps) =>
                                value.map((option, index) => {
                                    const { key, ...rest } = getTagProps({ index });
                                    return <CategoryChip key={key} name={option} registry={mode.registry} {...rest} />;
                                })
                            }
                            renderInput={(params) => (
                                <TextField {...params} size="small" label="Categories" placeholder="What was this?" />
                            )}
                        />
                    )}
                    {hidePicker && selected.map((draft) => (
                        <Stack key={draft.key} direction="row" alignItems="center" spacing={1}>
                            <Box sx={{
                                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                bgcolor: resolveLabelColor(draft.key, mode.registry),
                            }} />
                            <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                                {draft.key}
                            </Typography>
                            {!amountless && splitType === "equal" && selected.length > 1 && (
                                <Typography variant="body2" color="text.secondary">
                                    {formatCurrency(round2(perPart), currency)}
                                </Typography>
                            )}
                            {!amountless && splitType !== "equal" && valueField(draft)}
                        </Stack>
                    ))}
                    {!hidePicker && splitType !== "equal" && selected.map((draft) => (
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
                    {!hidePicker && splitType === "equal" && selected.length > 1 && (
                        <Typography variant="caption" color="text.secondary">
                            {formatCurrency(round2(perPart), currency)} to each {noun}
                        </Typography>
                    )}
                </Stack>
            )}

            {summary.text && (
                <Typography
                    variant="caption"
                    color={summary.error ? "warning.main" : "text.secondary"}
                    sx={{ display: "block", mt: 1 }}
                >
                    {summary.text}
                </Typography>
            )}
        </Box>
    );
}
