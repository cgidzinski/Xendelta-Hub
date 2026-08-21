import {
    Avatar, Box, Checkbox, InputAdornment, Stack, TextField, ToggleButton,
    ToggleButtonGroup, Typography,
} from "@mui/material";
import type { XenBudgetMember, ShareType } from "../../../../hooks/xenbudget/types";
import { formatCurrency, getCurrencySymbol, sanitizeAmount } from "../../../../utils/currencyUtils";

export interface ShareDraft {
    user_id: string;
    /** Raw text, so a half-typed "12." doesn't get clobbered mid-keystroke. */
    value: string;
}

interface ShareEditorProps {
    members: XenBudgetMember[];
    shareType: ShareType;
    onShareTypeChange: (t: ShareType) => void;
    selected: ShareDraft[];
    onSelectedChange: (s: ShareDraft[]) => void;
    amount: number;
    currency: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Picks who an item is attributed to and how it divides between them.
 *
 * The running total is the point of this component: per-person budgets are computed by
 * summing shares independently, so a split that doesn't add up to the item's amount would
 * quietly put the per-person figures out of step with the book total. The server applies
 * the same rounding correction (resolveShares) that the preview shows here.
 */
export default function ShareEditor({
    members, shareType, onShareTypeChange, selected, onSelectedChange, amount, currency,
}: ShareEditorProps) {
    const selectedIds = selected.map((s) => s.user_id);
    const isSelected = (id: string) => selectedIds.includes(id);

    const toggle = (id: string) => {
        if (isSelected(id)) onSelectedChange(selected.filter((s) => s.user_id !== id));
        else onSelectedChange([...selected, { user_id: id, value: "" }]);
    };

    const setValue = (id: string, raw: string) => {
        const clean = sanitizeAmount(raw);
        if (clean === null) return;
        onSelectedChange(selected.map((s) => (s.user_id === id ? { ...s, value: clean } : s)));
    };

    const entered = selected.reduce((acc, s) => acc + (parseFloat(s.value) || 0), 0);
    const perPerson = selected.length > 0 ? amount / selected.length : 0;

    const summary = (() => {
        if (selected.length === 0) return { text: "Pick at least one person", error: true };
        if (shareType === "equal") {
            return { text: `${formatCurrency(round2(perPerson), currency)} each`, error: false };
        }
        if (shareType === "percent") {
            const diff = round2(100 - entered);
            if (Math.abs(diff) < 0.01) return { text: "100% allocated", error: false };
            return {
                text: diff > 0 ? `${round2(diff)}% left to allocate` : `${round2(-diff)}% over`,
                error: true,
            };
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

    return (
        <Box>
            <ToggleButtonGroup
                size="small" exclusive fullWidth value={shareType}
                onChange={(_, v) => v && onShareTypeChange(v)}
                sx={{ mb: 1 }}
            >
                <ToggleButton value="equal">Split evenly</ToggleButton>
                <ToggleButton value="exact">Exact amounts</ToggleButton>
                <ToggleButton value="percent">Percentages</ToggleButton>
            </ToggleButtonGroup>

            <Stack spacing={0.5}>
                {members.map((m) => {
                    const draft = selected.find((s) => s.user_id === m.user_id);
                    return (
                        <Stack key={m.user_id} direction="row" alignItems="center" spacing={1}>
                            <Checkbox
                                size="small" checked={!!draft}
                                onChange={() => toggle(m.user_id)}
                            />
                            <Avatar src={m.avatar || undefined} sx={{ width: 26, height: 26, fontSize: 12 }}>
                                {m.username[0]?.toUpperCase()}
                            </Avatar>
                            <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                                {m.username}
                            </Typography>
                            {draft && shareType === "equal" && (
                                <Typography variant="body2" color="text.secondary">
                                    {formatCurrency(round2(perPerson), currency)}
                                </Typography>
                            )}
                            {draft && shareType !== "equal" && (
                                <TextField
                                    size="small" value={draft.value}
                                    onChange={(e) => setValue(m.user_id, e.target.value)}
                                    sx={{ width: 120 }}
                                    slotProps={{
                                        input: shareType === "percent"
                                            ? { endAdornment: <InputAdornment position="end">%</InputAdornment> }
                                            : { startAdornment: <InputAdornment position="start">{getCurrencySymbol(currency)}</InputAdornment> },
                                    }}
                                />
                            )}
                        </Stack>
                    );
                })}
            </Stack>

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
