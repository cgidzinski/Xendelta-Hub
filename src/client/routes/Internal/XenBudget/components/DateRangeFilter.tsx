import { useState } from "react";
import { Box, MenuItem, Stack, TextField } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import {
    endOfDay, startOfMonth, startOfQuarter, startOfYear, subMonths, subYears,
} from "date-fns";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";

export type RangePreset =
    | "thisMonth" | "lastMonth" | "last3" | "last6" | "thisQuarter" | "thisYear" | "lastYear" | "custom";

const PRESETS: { value: RangePreset; label: string }[] = [
    { value: "thisMonth", label: "This month" },
    { value: "lastMonth", label: "Last month" },
    { value: "last3", label: "Last 3 months" },
    { value: "last6", label: "Last 6 months" },
    { value: "thisQuarter", label: "This quarter" },
    { value: "thisYear", label: "This year" },
    { value: "lastYear", label: "Last year" },
    { value: "custom", label: "Custom range" },
];

export interface DateRange {
    from: Date;
    to: Date;
    /** Buckets get coarser as the window widens, so a year doesn't render 365 columns. */
    groupBy: "day" | "week" | "month";
}

export function resolveRange(preset: RangePreset, customFrom: Date | null, customTo: Date | null): DateRange {
    const now = new Date();
    switch (preset) {
        case "thisMonth":
            return { from: startOfMonth(now), to: endOfDay(now), groupBy: "day" };
        case "lastMonth": {
            const from = startOfMonth(subMonths(now, 1));
            return { from, to: endOfDay(subMonths(startOfMonth(now), 0)), groupBy: "day" };
        }
        case "last3":
            return { from: startOfMonth(subMonths(now, 2)), to: endOfDay(now), groupBy: "month" };
        case "last6":
            return { from: startOfMonth(subMonths(now, 5)), to: endOfDay(now), groupBy: "month" };
        case "thisQuarter":
            return { from: startOfQuarter(now), to: endOfDay(now), groupBy: "week" };
        case "thisYear":
            return { from: startOfYear(now), to: endOfDay(now), groupBy: "month" };
        case "lastYear": {
            const from = startOfYear(subYears(now, 1));
            return { from, to: endOfDay(startOfYear(now)), groupBy: "month" };
        }
        default: {
            const from = customFrom || startOfMonth(now);
            const to = customTo || endOfDay(now);
            const days = (to.getTime() - from.getTime()) / 86400000;
            return { from, to, groupBy: days > 180 ? "month" : days > 45 ? "week" : "day" };
        }
    }
}

interface DateRangeFilterProps {
    preset: RangePreset;
    onPresetChange: (preset: RangePreset) => void;
    customFrom: Date | null;
    customTo: Date | null;
    onCustomChange: (from: Date | null, to: Date | null) => void;
    currency: string;
    currencies: string[];
    onCurrencyChange: (currency: string) => void;
}

/**
 * One filter row above the charts, never inside a chart card — a per-chart filter makes
 * two charts on the same screen silently describe different periods.
 */
export default function DateRangeFilter({
    preset, onPresetChange, customFrom, customTo, onCustomChange,
    currency, currencies, onCurrencyChange,
}: DateRangeFilterProps) {
    const [open, setOpen] = useState(preset === "custom");

    return (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mb: 2 }}>
            <TextField
                select size="small" label="Period" value={preset}
                onChange={(e) => {
                    const next = e.target.value as RangePreset;
                    onPresetChange(next);
                    setOpen(next === "custom");
                }}
                sx={{ minWidth: 160 }}
                slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
            >
                {PRESETS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
            </TextField>

            {open && (
                <>
                    <DatePicker
                        label="From" value={customFrom}
                        onChange={(v) => onCustomChange(v, customTo)}
                        slotProps={{ textField: { size: "small", sx: { width: 160 } } }}
                    />
                    <DatePicker
                        label="To" value={customTo}
                        onChange={(v) => onCustomChange(customFrom, v)}
                        slotProps={{ textField: { size: "small", sx: { width: 160 } } }}
                    />
                </>
            )}

            <Box sx={{ flexGrow: 1 }} />

            {currencies.length > 1 && (
                <TextField
                    select size="small" label="Currency" value={currency}
                    onChange={(e) => onCurrencyChange(e.target.value)}
                    sx={{ width: 110 }}
                    slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                >
                    {currencies.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </TextField>
            )}
        </Stack>
    );
}
