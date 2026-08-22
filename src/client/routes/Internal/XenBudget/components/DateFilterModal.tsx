import { useEffect, useState } from "react";
import {
    Box, Button, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import {
    endOfMonth, format, isSameDay, isSameMonth, startOfMonth,
} from "date-fns";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";

export type DatePreset = "all" | "thisWeek" | "lastWeek" | "thisYear" | "custom";

export interface DateFilterValue {
    preset: DatePreset;
    /** Only meaningful when preset is "custom". */
    from: Date | null;
    to: Date | null;
}

export const DEFAULT_DATE_FILTER: DateFilterValue = { preset: "all", from: null, to: null };

const PRESETS: { label: string; value: Exclude<DatePreset, "custom"> }[] = [
    { label: "All", value: "all" },
    { label: "This week", value: "thisWeek" },
    { label: "Last week", value: "lastWeek" },
    { label: "This year", value: "thisYear" },
];

// January through December of the current year, in calendar order — a specific month is
// the common ask on an expense tracker, so it gets its own grid rather than being buried
// as two named presets. A prior year is still reachable through the custom range below.
const CURRENT_YEAR = new Date().getFullYear();
const MONTH_GRID = Array.from({ length: 12 }, (_, i) => new Date(CURRENT_YEAR, i, 1));

export function dateFilterLabel(value: DateFilterValue): string {
    if (value.preset !== "custom") {
        return PRESETS.find((p) => p.value === value.preset)?.label ?? "All";
    }
    if (value.from && value.to) {
        // A range that's exactly one calendar month reads better as its name than as a
        // start/end pair — this is what picking a month from the grid below produces.
        if (isSameDay(value.from, startOfMonth(value.from)) && isSameDay(value.to, endOfMonth(value.from))) {
            return format(value.from, "MMMM yyyy");
        }
        return `${format(value.from, "MMM d")} – ${format(value.to, "MMM d")}`;
    }
    if (value.from) return `From ${format(value.from, "MMM d")}`;
    if (value.to) return `Until ${format(value.to, "MMM d")}`;
    return "Custom range";
}

interface DateFilterModalProps {
    open: boolean;
    onClose: () => void;
    value: DateFilterValue;
    onChange: (value: DateFilterValue) => void;
}

/**
 * A button opens this rather than the filter row hosting presets and date fields directly
 * — a date range needs more room than a header row can spare, especially on mobile where
 * the item list is already tight for space.
 */
export default function DateFilterModal({
    open, onClose, value, onChange,
}: DateFilterModalProps) {
    const [draftFrom, setDraftFrom] = useState<Date | null>(value.from);
    const [draftTo, setDraftTo] = useState<Date | null>(value.to);

    // Re-seed the custom range whenever the dialog opens, so a cancelled edit doesn't stick.
    useEffect(() => {
        if (!open) return;
        setDraftFrom(value.from);
        setDraftTo(value.to);
    }, [open, value.from, value.to]);

    const pickPreset = (preset: Exclude<DatePreset, "custom">) => {
        onChange({ preset, from: null, to: null });
        onClose();
    };

    const pickMonth = (monthStart: Date) => {
        onChange({ preset: "custom", from: monthStart, to: endOfMonth(monthStart) });
        onClose();
    };

    const applyCustom = () => {
        onChange({ preset: "custom", from: draftFrom, to: draftTo });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                Select dates
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <Box>
                        <Typography variant="caption" sx={sectionLabelSx}>Quick select</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mt: 1 }}>
                            {PRESETS.map((p) => (
                                <Button
                                    key={p.value} size="small"
                                    variant={value.preset === p.value ? "contained" : "outlined"}
                                    onClick={() => pickPreset(p.value)}
                                >
                                    {p.label}
                                </Button>
                            ))}
                        </Stack>
                    </Box>
                    <Divider />
                    <Box>
                        <Typography variant="caption" sx={sectionLabelSx}>Pick a month</Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, mt: 1 }}>
                            {MONTH_GRID.map((m) => {
                                const selected = value.preset === "custom" && !!value.from && !!value.to
                                    && isSameDay(value.from, m) && isSameDay(value.to, endOfMonth(m));
                                // Marked, not selected: current-month gets a colour hint on
                                // the label, but only the contained variant means "applied".
                                const isCurrent = isSameMonth(m, new Date());
                                return (
                                    <Button
                                        key={m.toISOString()} size="small" fullWidth
                                        variant={selected ? "contained" : "outlined"}
                                        onClick={() => pickMonth(m)}
                                        sx={!selected && isCurrent ? { color: "success.main" } : undefined}
                                    >
                                        {format(m, "MMM yyyy")}
                                    </Button>
                                );
                            })}
                        </Box>
                    </Box>
                    <Divider />
                    <Box>
                        <Typography variant="caption" sx={sectionLabelSx}>Custom range</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <DatePicker
                                label="From" value={draftFrom} onChange={setDraftFrom}
                                slotProps={{ textField: { size: "small", fullWidth: true } }}
                            />
                            <DatePicker
                                label="To" value={draftTo} onChange={setDraftTo}
                                slotProps={{ textField: { size: "small", fullWidth: true } }}
                            />
                            {/* Its own button, not the dialog's global action — nothing else
                                here needs an extra click to take effect, so this shouldn't
                                read as if it applies the whole dialog either. */}
                            <Button
                                variant="contained" size="small" sx={{ flexShrink: 0 }}
                                disabled={!draftFrom && !draftTo} onClick={applyCustom}
                            >
                                Apply
                            </Button>
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
