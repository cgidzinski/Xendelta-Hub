import { useState } from "react";
import { Button } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PeriodPickerDialog, { type QuickPick } from "./PeriodPickerDialog";
import {
    defaultMonthMode, defaultYearMode, resolvePeriod, type PeriodMode,
} from "./periodMode";

/**
 * Quick picks for the tabs that summarise a window. Overview and Report both want the
 * wider month spans; neither has any use for "All time", which would ask the server to
 * bucket a whole book's history.
 *
 * Built per call, not held as a module constant: "this month" has to mean the month it is
 * now, and a PWA's module scope is evaluated once and then lives for weeks.
 */
export const summaryQuickPicks = (): QuickPick[] => [
    { id: "thisMonth", label: "This month", mode: defaultMonthMode() },
    { id: "thisYear", label: "This year", mode: defaultYearMode() },
    { id: "last3", label: "Last 3 months", mode: { kind: "preset", preset: "last3" } },
    { id: "last6", label: "Last 6 months", mode: { kind: "preset", preset: "last6" } },
    { id: "thisQuarter", label: "This quarter", mode: { kind: "preset", preset: "thisQuarter" } },
];

/**
 * Quick picks for the item list, which is the one place that wants a single week and the
 * one place "All time" is cheap — it drops the date filter rather than widening it.
 */
export const itemQuickPicks = (): QuickPick[] => [
    { id: "all", label: "All time", mode: { kind: "all" } },
    { id: "thisWeek", label: "This week", mode: { kind: "preset", preset: "thisWeek" } },
    { id: "lastWeek", label: "Last week", mode: { kind: "preset", preset: "lastWeek" } },
    { id: "thisMonth", label: "This month", mode: defaultMonthMode() },
    { id: "thisYear", label: "This year", mode: defaultYearMode() },
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
 */
export default function TimePeriodFilter({
    mode, onModeChange, quickPicks, sx,
}: TimePeriodFilterProps) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                size="small" variant="outlined" startIcon={<CalendarMonthIcon />}
                onClick={() => setOpen(true)}
                sx={{ flexShrink: 0, ...sx }}
            >
                {resolvePeriod(mode).label}
            </Button>

            <PeriodPickerDialog
                open={open} onClose={() => setOpen(false)}
                value={mode} onChange={onModeChange}
                quickPicks={quickPicks}
            />
        </>
    );
}
