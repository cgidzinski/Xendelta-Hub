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

/** UTC midnight of a local-midnight Date's calendar day — item dates are date-only UTC. */
function utcDay(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** The end of a calendar day in UTC, so an inclusive `$lte` still covers the whole day. */
function utcEndOfDay(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
}

/** Turns a `PeriodMode` into the from/to/groupBy a summary query needs, plus its label. */
export function resolvePeriod(mode: PeriodMode): ResolvedPeriod {
    if (mode.kind === "month") {
        const from = startOfMonth(mode.anchor);
        return {
            from: utcDay(from), to: utcEndOfDay(endOfMonth(mode.anchor)), groupBy: "day",
            label: format(from, "MMMM yyyy"),
        };
    }
    if (mode.kind === "year") {
        const from = startOfYear(mode.anchor);
        return {
            from: utcDay(from), to: utcEndOfDay(endOfYear(mode.anchor)), groupBy: "month",
            label: format(from, "yyyy"),
        };
    }
    if (mode.kind === "preset") {
        const now = new Date();
        if (mode.preset === "last3") {
            return {
                from: utcDay(startOfMonth(subMonths(now, 2))), to: utcEndOfDay(endOfMonth(now)),
                groupBy: "month", label: PRESET_LABELS.last3,
            };
        }
        if (mode.preset === "last6") {
            return {
                from: utcDay(startOfMonth(subMonths(now, 5))), to: utcEndOfDay(endOfMonth(now)),
                groupBy: "month", label: PRESET_LABELS.last6,
            };
        }
        return {
            from: utcDay(startOfQuarter(now)), to: utcEndOfDay(now),
            groupBy: "week", label: PRESET_LABELS.thisQuarter,
        };
    }
    const days = (mode.to.getTime() - mode.from.getTime()) / 86400000;
    const label = `${format(mode.from, "MMM d")} – ${format(mode.to, "MMM d")}`;
    return {
        from: utcDay(mode.from), to: utcEndOfDay(mode.to),
        groupBy: days > 180 ? "month" : days > 45 ? "week" : "day",
        label,
    };
}

export const defaultMonthMode = (): PeriodMode => ({ kind: "month", anchor: startOfMonth(new Date()) });
export const defaultYearMode = (): PeriodMode => ({ kind: "year", anchor: startOfYear(new Date()) });

/** For stashing the picked period in localStorage — Dates aren't JSON-safe on their own. */
export function serializePeriodMode(mode: PeriodMode): string {
    if (mode.kind === "month" || mode.kind === "year") {
        return JSON.stringify({ kind: mode.kind, anchor: mode.anchor.toISOString() });
    }
    if (mode.kind === "preset") return JSON.stringify({ kind: "preset", preset: mode.preset });
    return JSON.stringify({ kind: "custom", from: mode.from.toISOString(), to: mode.to.toISOString() });
}

/** The other half of `serializePeriodMode`. Returns null for anything missing or malformed. */
export function parsePeriodMode(raw: string | null): PeriodMode | null {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (obj.kind === "month" || obj.kind === "year") return { kind: obj.kind, anchor: new Date(obj.anchor) };
        if (obj.kind === "preset" && ["last3", "last6", "thisQuarter"].includes(obj.preset)) {
            return { kind: "preset", preset: obj.preset };
        }
        if (obj.kind === "custom") return { kind: "custom", from: new Date(obj.from), to: new Date(obj.to) };
        return null;
    } catch {
        return null;
    }
}

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

            <Button
                size="small" variant="outlined" startIcon={<CalendarMonthIcon />}
                onClick={() => {
                    setGridYear(mode.kind === "month" || mode.kind === "year" ? mode.anchor.getFullYear() : now.getFullYear());
                    setCustomFrom(mode.kind === "custom" ? mode.from : null);
                    setCustomTo(mode.kind === "custom" ? mode.to : null);
                    setPeriodOpen(true);
                }}
                sx={{ flexShrink: 0 }}
            >
                {resolved.label}
            </Button>

            <Dialog open={periodOpen} onClose={() => setPeriodOpen(false)} maxWidth="sm" fullWidth>
                <Box sx={{ p: 3 }}>
                    <Typography variant="subtitle2" sx={sectionLabelSx}>Quick picks</Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mt: 1.25, mb: 2.5 }}>
                        <Chip
                            label="This month" sx={{ borderRadius: 2 }}
                            onClick={() => { onModeChange(defaultMonthMode()); setPeriodOpen(false); }}
                        />
                        <Chip
                            label="This year" sx={{ borderRadius: 2 }}
                            onClick={() => { onModeChange(defaultYearMode()); setPeriodOpen(false); }}
                        />
                        {showExtraPresets && (
                            <>
                                <Chip label="Last 3 months" sx={{ borderRadius: 2 }} onClick={() => pickPreset("last3")} />
                                <Chip label="Last 6 months" sx={{ borderRadius: 2 }} onClick={() => pickPreset("last6")} />
                                <Chip label="This quarter" sx={{ borderRadius: 2 }} onClick={() => pickPreset("thisQuarter")} />
                            </>
                        )}
                    </Stack>

                    <Typography variant="subtitle2" sx={sectionLabelSx}>
                        {mode.kind === "year" ? "Pick a year" : "Pick a month"}
                    </Typography>

                    {mode.kind === "year" ? (
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.25, mt: 1.25 }}>
                            {Array.from(
                                { length: YEAR_GRID_SPAN },
                                (_, i) => now.getFullYear() - YEAR_GRID_SPAN + 1 + i,
                            ).map((y) => {
                                const isSel = mode.kind === "year" && mode.anchor.getFullYear() === y;
                                return (
                                    <Chip
                                        key={y} label={y}
                                        sx={{ borderRadius: 2, height: 36, fontSize: 15, ...(y === now.getFullYear() && !isSel ? { color: "success.main", borderColor: "success.main" } : {}) }}
                                        color={isSel ? "primary" : undefined}
                                        variant={isSel ? "filled" : "outlined"}
                                        onClick={() => pickYear(y)}
                                    />
                                );
                            })}
                        </Box>
                    ) : (
                        <>
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5} sx={{ mt: 1.25, mb: 1.25 }}>
                                <IconButton onClick={() => setGridYear((y) => y - 1)} aria-label="Previous year">
                                    <ChevronLeftIcon />
                                </IconButton>
                                <Typography variant="body1" sx={{ minWidth: 48, textAlign: "center" }}>{gridYear}</Typography>
                                <IconButton
                                    disabled={gridYear >= now.getFullYear()}
                                    onClick={() => setGridYear((y) => y + 1)} aria-label="Next year"
                                >
                                    <ChevronRightIcon />
                                </IconButton>
                            </Stack>
                            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.25 }}>
                                {Array.from({ length: 12 }, (_, m) => m).map((m) => {
                                    const isSel = mode.kind === "month" && mode.anchor.getFullYear() === gridYear && mode.anchor.getMonth() === m;
                                    const isNow = gridYear === now.getFullYear() && m === now.getMonth();
                                    return (
                                        <Chip
                                            key={m} label={format(new Date(gridYear, m, 1), "MMM")}
                                            sx={{ borderRadius: 2, height: 36, fontSize: 15, ...(isNow && !isSel ? { color: "success.main", borderColor: "success.main" } : {}) }}
                                            color={isSel ? "primary" : undefined}
                                            variant={isSel ? "filled" : "outlined"}
                                            onClick={() => pickMonth(m)}
                                        />
                                    );
                                })}
                            </Box>
                        </>
                    )}

                    <Typography variant="subtitle2" sx={{ ...sectionLabelSx, display: "block", mt: 2.5, mb: 1.25 }}>
                        Custom range
                    </Typography>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                        <DatePicker
                            label="From" value={customFrom} onChange={setCustomFrom}
                            sx={{ flex: 1 }}
                        />
                        <DatePicker
                            label="To" value={customTo} onChange={setCustomTo}
                            sx={{ flex: 1 }}
                        />
                        <Button
                            variant="contained" disabled={!customFrom && !customTo}
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
