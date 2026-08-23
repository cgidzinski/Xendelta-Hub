import { useState } from "react";
import {
    Box, Button, Chip, Dialog, IconButton, Stack, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import {
    endOfDay, endOfMonth, endOfYear, format, startOfMonth, startOfQuarter,
    startOfYear, subMonths,
} from "date-fns";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";

export type PeriodMode =
    | { kind: "month"; anchor: Date }
    | { kind: "year"; anchor: Date }
    | { kind: "preset"; preset: "last3" | "last6" | "thisQuarter" }
    | { kind: "custom"; from: Date; to: Date };

export interface ResolvedPeriod {
    from: Date;
    to: Date;
    groupBy: "day" | "week" | "month";
    label: string;
}

const PRESET_LABELS: Record<"last3" | "last6" | "thisQuarter", string> = {
    last3: "Last 3 months",
    last6: "Last 6 months",
    thisQuarter: "This quarter",
};

/** Turns a `PeriodMode` into the from/to/groupBy a summary query needs, plus its label. */
export function resolvePeriod(mode: PeriodMode): ResolvedPeriod {
    if (mode.kind === "month") {
        const from = startOfMonth(mode.anchor);
        return {
            from, to: endOfMonth(mode.anchor), groupBy: "day",
            label: format(from, "MMMM yyyy"),
        };
    }
    if (mode.kind === "year") {
        const from = startOfYear(mode.anchor);
        return {
            from, to: endOfYear(mode.anchor), groupBy: "month",
            label: format(from, "yyyy"),
        };
    }
    if (mode.kind === "preset") {
        const now = new Date();
        if (mode.preset === "last3") {
            return {
                from: startOfMonth(subMonths(now, 2)), to: endOfDay(now),
                groupBy: "month", label: PRESET_LABELS.last3,
            };
        }
        if (mode.preset === "last6") {
            return {
                from: startOfMonth(subMonths(now, 5)), to: endOfDay(now),
                groupBy: "month", label: PRESET_LABELS.last6,
            };
        }
        return {
            from: startOfQuarter(now), to: endOfDay(now),
            groupBy: "week", label: PRESET_LABELS.thisQuarter,
        };
    }
    const days = (mode.to.getTime() - mode.from.getTime()) / 86400000;
    const label = `${format(mode.from, "MMM d")} – ${format(mode.to, "MMM d")}`;
    return {
        from: mode.from, to: mode.to,
        groupBy: days > 180 ? "month" : days > 45 ? "week" : "day",
        label,
    };
}

export const defaultMonthMode = (): PeriodMode => ({ kind: "month", anchor: startOfMonth(new Date()) });
export const defaultYearMode = (): PeriodMode => ({ kind: "year", anchor: startOfYear(new Date()) });

const YEAR_GRID_SPAN = 8;

interface TimePeriodFilterProps {
    mode: PeriodMode;
    onModeChange: (mode: PeriodMode) => void;
    /** Report wants the wider Last 3/6 months + This quarter picks too; Overview doesn't. */
    showExtraPresets?: boolean;
}

/**
 * The time filter shared by Overview and Report: a period pill that opens a centered
 * dialog in the same chip vocabulary — a quick pick and a grid cell are all the same
 * shape, so the pickers read as one family of control.
 */
export default function TimePeriodFilter({
    mode, onModeChange, showExtraPresets,
}: TimePeriodFilterProps) {
    const [periodOpen, setPeriodOpen] = useState(false);
    // Which year the month grid is browsing — independent of the applied anchor, so
    // browsing around doesn't apply anything until a cell is actually clicked.
    const [gridYear, setGridYear] = useState(new Date().getFullYear());
    const [customFrom, setCustomFrom] = useState<Date | null>(null);
    const [customTo, setCustomTo] = useState<Date | null>(null);

    const now = new Date();
    const resolved = resolvePeriod(mode);

    const pickMonth = (m: number) => { onModeChange({ kind: "month", anchor: new Date(gridYear, m, 1) }); setPeriodOpen(false); };
    const pickYear = (y: number) => { onModeChange({ kind: "year", anchor: new Date(y, 0, 1) }); setPeriodOpen(false); };
    const pickPreset = (preset: "last3" | "last6" | "thisQuarter") => { onModeChange({ kind: "preset", preset }); setPeriodOpen(false); };
    const applyCustom = () => {
        if (!customFrom && !customTo) return;
        onModeChange({ kind: "custom", from: customFrom || startOfMonth(now), to: customTo || endOfDay(now) });
        setPeriodOpen(false);
    };

    return (
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
            <Box sx={{ flexGrow: 1 }} />

            <Box
                onClick={() => {
                    setGridYear(mode.kind === "month" || mode.kind === "year" ? mode.anchor.getFullYear() : now.getFullYear());
                    setCustomFrom(mode.kind === "custom" ? mode.from : null);
                    setCustomTo(mode.kind === "custom" ? mode.to : null);
                    setPeriodOpen(true);
                }}
                sx={{
                    display: "inline-flex", alignItems: "center", flexShrink: 0,
                    border: "1px solid", borderColor: "divider", borderRadius: 2, height: 36, px: 1.5,
                    cursor: "pointer",
                }}
            >
                <CalendarMonthIcon sx={{ fontSize: 18 }} />
                <Typography
                    component="span" variant="body2" noWrap
                    sx={{
                        fontSize: 14, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                        minWidth: 72, maxWidth: 120, textAlign: "center", ml: 0.5,
                    }}
                >
                    {resolved.label}
                </Typography>
            </Box>

            <Dialog open={periodOpen} onClose={() => setPeriodOpen(false)} maxWidth="xs">
                <Box sx={{ p: 1.5, width: 300 }}>
                    <Typography variant="caption" sx={sectionLabelSx}>Quick picks</Typography>
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75, mt: 1, mb: 1.75 }}>
                        <Chip
                            label="This month" size="small" sx={{ borderRadius: 2 }}
                            onClick={() => { onModeChange(defaultMonthMode()); setPeriodOpen(false); }}
                        />
                        <Chip
                            label="This year" size="small" sx={{ borderRadius: 2 }}
                            onClick={() => { onModeChange(defaultYearMode()); setPeriodOpen(false); }}
                        />
                        {showExtraPresets && (
                            <>
                                <Chip label="Last 3 months" size="small" sx={{ borderRadius: 2 }} onClick={() => pickPreset("last3")} />
                                <Chip label="Last 6 months" size="small" sx={{ borderRadius: 2 }} onClick={() => pickPreset("last6")} />
                                <Chip label="This quarter" size="small" sx={{ borderRadius: 2 }} onClick={() => pickPreset("thisQuarter")} />
                            </>
                        )}
                    </Stack>

                    <Typography variant="caption" sx={sectionLabelSx}>
                        {mode.kind === "year" ? "Pick a year" : "Pick a month"}
                    </Typography>

                    {mode.kind === "year" ? (
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.75, mt: 1 }}>
                            {Array.from(
                                { length: YEAR_GRID_SPAN },
                                (_, i) => now.getFullYear() - YEAR_GRID_SPAN + 1 + i,
                            ).map((y) => {
                                const isSel = mode.kind === "year" && mode.anchor.getFullYear() === y;
                                return (
                                    <Chip
                                        key={y} label={y} size="small"
                                        sx={{ borderRadius: 2, ...(y === now.getFullYear() && !isSel ? { color: "success.main", borderColor: "success.main" } : {}) }}
                                        color={isSel ? "primary" : undefined}
                                        variant={isSel ? "filled" : "outlined"}
                                        onClick={() => pickYear(y)}
                                    />
                                );
                            })}
                        </Box>
                    ) : (
                        <>
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 1, mb: 0.75 }}>
                                <IconButton size="small" onClick={() => setGridYear((y) => y - 1)} aria-label="Previous year">
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                                <Typography variant="body2" sx={{ minWidth: 40, textAlign: "center" }}>{gridYear}</Typography>
                                <IconButton
                                    size="small" disabled={gridYear >= now.getFullYear()}
                                    onClick={() => setGridYear((y) => y + 1)} aria-label="Next year"
                                >
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.75 }}>
                                {Array.from({ length: 12 }, (_, m) => m).map((m) => {
                                    const isSel = mode.kind === "month" && mode.anchor.getFullYear() === gridYear && mode.anchor.getMonth() === m;
                                    const isNow = gridYear === now.getFullYear() && m === now.getMonth();
                                    return (
                                        <Chip
                                            key={m} label={format(new Date(gridYear, m, 1), "MMM")} size="small"
                                            sx={{ borderRadius: 2, ...(isNow && !isSel ? { color: "success.main", borderColor: "success.main" } : {}) }}
                                            color={isSel ? "primary" : undefined}
                                            variant={isSel ? "filled" : "outlined"}
                                            onClick={() => pickMonth(m)}
                                        />
                                    );
                                })}
                            </Box>
                        </>
                    )}

                    <Typography variant="caption" sx={{ ...sectionLabelSx, display: "block", mt: 1.75, mb: 1 }}>
                        Custom range
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                        <DatePicker
                            label="From" value={customFrom} onChange={setCustomFrom}
                            slotProps={{ textField: { size: "small" } }} sx={{ width: 116 }}
                        />
                        <DatePicker
                            label="To" value={customTo} onChange={setCustomTo}
                            slotProps={{ textField: { size: "small" } }} sx={{ width: 116 }}
                        />
                        <Button
                            variant="contained" size="small" disabled={!customFrom && !customTo}
                            onClick={applyCustom} sx={{ flexShrink: 0 }}
                        >
                            Apply
                        </Button>
                    </Stack>
                </Box>
            </Dialog>
        </Stack>
    );
}
