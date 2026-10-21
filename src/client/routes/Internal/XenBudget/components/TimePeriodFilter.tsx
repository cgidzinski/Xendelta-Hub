import { useState } from "react";
import { Button, IconButton, Stack, useMediaQuery, useTheme } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PeriodPickerDialog, { type QuickPick } from "./PeriodPickerDialog";
import {
    isAnchored, resolvePeriod, stepPeriod, unitMode, type PeriodMode,
} from "./periodMode";

/**
 * The display ladder, day up to year. Picking one restates every budget into it, so these
 * are the same five rungs everywhere rather than a per-tab selection — what changes between
 * tabs is only what else is offered alongside them.
 *
 * Built per call, not held as a module constant: "this month" has to mean the month it is
 * now, and a PWA's module scope is evaluated once and then lives for weeks.
 */
const ladderPicks = (): QuickPick[] => [
    { id: "today", label: "Today", mode: unitMode("day") },
    { id: "thisWeek", label: "This week", mode: unitMode("week") },
    { id: "thisMonth", label: "This month", mode: unitMode("month") },
    { id: "thisQuarter", label: "This quarter", mode: unitMode("quarter") },
    { id: "thisYear", label: "This year", mode: unitMode("year") },
];

/**
 * Quick picks for the tabs that summarise a window. Overview and Report both want the
 * wider month spans too; neither has any use for "All time", which would ask the server to
 * bucket a whole book's history.
 */
export const summaryQuickPicks = (): QuickPick[] => [
    ...ladderPicks(),
    { id: "last3", label: "Last 3 months", mode: { kind: "preset", preset: "last3" } },
    { id: "last6", label: "Last 6 months", mode: { kind: "preset", preset: "last6" } },
];

/**
 * Quick picks for the item list, the one place "All time" is cheap — it drops the date
 * filter rather than widening it.
 */
export const itemQuickPicks = (): QuickPick[] => [
    { id: "all", label: "All time", mode: { kind: "all" } },
    ...ladderPicks(),
];

interface TimePeriodFilterProps {
    mode: PeriodMode;
    onModeChange: (mode: PeriodMode) => void;
    quickPicks: QuickPick[];
    sx?: SxProps<Theme>;
}

/**
 * The period pill. Every tab renders one, they all read and write the same shared window
 * (see BookDetail), and they all open the same dialog.
 *
 * A window that is one calendar unit gets arrows either side, so last week or the quarter
 * before this one is a click rather than a trip through the custom-range picker. The spans
 * and "All time" have no previous or next, so they render the pill alone.
 */
export default function TimePeriodFilter({
    mode, onModeChange, quickPicks, sx,
}: TimePeriodFilterProps) {
    const [open, setOpen] = useState(false);
    const theme = useTheme();
    // The shared pill, so every tab shortens together — the whole point of one window is
    // that Items and Overview name it the same way. Items is the tab that needs it: its
    // row has to hold Source and Filters beside this at 360px.
    const compact = useMediaQuery(theme.breakpoints.down("sm"));
    const resolved = resolvePeriod(mode);
    const steppable = isAnchored(mode);

    const step = (delta: number) => () => onModeChange(stepPeriod(mode, delta));

    return (
        <>
            <Stack direction="row" alignItems="center" sx={{ flexShrink: 0, ...sx }}>
                {steppable && (
                    <IconButton size="small" onClick={step(-1)} aria-label="Previous period">
                        <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                )}
                <Button
                    size="small" variant="outlined" startIcon={<CalendarMonthIcon />}
                    onClick={() => setOpen(true)}
                    sx={{ flexShrink: 0 }}
                >
                    {compact ? resolved.shortLabel : resolved.label}
                </Button>
                {steppable && (
                    <IconButton size="small" onClick={step(1)} aria-label="Next period">
                        <ChevronRightIcon fontSize="small" />
                    </IconButton>
                )}
            </Stack>

            <PeriodPickerDialog
                open={open} onClose={() => setOpen(false)}
                value={mode} onChange={onModeChange}
                quickPicks={quickPicks}
            />
        </>
    );
}
