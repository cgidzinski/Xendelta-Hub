import { useEffect, useState } from "react";
import {
    Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography,
    useMediaQuery,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { endOfDay, endOfMonth, format, startOfMonth } from "date-fns";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { resolvePeriod, type PeriodMode } from "./periodMode";

const YEAR_GRID_SPAN = 8;

export interface QuickPick {
    /** Stable id, only used as a React key and to match the applied mode. */
    id: string;
    label: string;
    mode: PeriodMode;
}

interface PeriodPickerDialogProps {
    open: boolean;
    onClose: () => void;
    value: PeriodMode;
    onChange: (mode: PeriodMode) => void;
    /**
     * The shortcuts this tab puts one tap away. Every tab can still *render* any mode —
     * the window is shared — so this only decides what's offered, not what's reachable.
     */
    quickPicks: QuickPick[];
}

/**
 * The one date picker in XenBudget, opened from every tab's period button.
 *
 * It goes full-screen on a phone like every other dialog in the module, and the custom
 * range stacks rather than trying to fit two date fields and a button across ~250px.
 */
export default function PeriodPickerDialog({
    open, onClose, value, onChange, quickPicks,
}: PeriodPickerDialogProps) {
    const isMobile = useMediaQuery("(max-width:600px)");
    const now = new Date();

    // Which year the grid is browsing — independent of the applied anchor, so browsing
    // around doesn't apply anything until a cell is actually clicked.
    const [gridYear, setGridYear] = useState(now.getFullYear());
    const [customFrom, setCustomFrom] = useState<Date | null>(null);
    const [customTo, setCustomTo] = useState<Date | null>(null);

    // Re-seed on open, so a cancelled edit doesn't stick and the grid lands on the year
    // you're actually looking at.
    useEffect(() => {
        if (!open) return;
        setGridYear(
            value.kind === "month" || value.kind === "year"
                ? value.anchor.getFullYear()
                : value.kind === "custom" ? value.from.getFullYear() : now.getFullYear(),
        );
        setCustomFrom(value.kind === "custom" ? value.from : null);
        setCustomTo(value.kind === "custom" ? value.to : null);
        // Only when the dialog opens: re-seeding on every value change would fight the
        // user mid-edit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const apply = (mode: PeriodMode) => { onChange(mode); onClose(); };

    const applyCustom = () => {
        if (!customFrom && !customTo) return;
        apply({
            kind: "custom",
            from: customFrom ?? startOfMonth(now),
            to: customTo ?? endOfDay(now),
        });
    };

    // A quick pick reads as applied when it resolves to the same window as the current
    // value — so "This month" stays lit whether it was picked from the chip or the grid.
    const appliedLabel = resolvePeriod(value).label;
    const isApplied = (pick: QuickPick) => resolvePeriod(pick.mode).label === appliedLabel;

    const yearMode = value.kind === "year";

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                Select dates
                <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: 3 }}>
                <Typography variant="subtitle2" sx={sectionLabelSx}>Quick picks</Typography>
                <Stack useFlexGap direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 1.25, mb: 2.5 }}>
                    {quickPicks.map((pick) => {
                        const applied = isApplied(pick);
                        return (
                            <Chip
                                key={pick.id}
                                label={pick.label}
                                sx={{ borderRadius: 2 }}
                                color={applied ? "primary" : undefined}
                                variant={applied ? "filled" : "outlined"}
                                onClick={() => apply(pick.mode)}
                            />
                        );
                    })}
                </Stack>

                <Typography variant="subtitle2" sx={sectionLabelSx}>
                    {yearMode ? "Pick a year" : "Pick a month"}
                </Typography>

                {yearMode ? (
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.25, mt: 1.25 }}>
                        {Array.from(
                            { length: YEAR_GRID_SPAN },
                            (_, i) => now.getFullYear() - YEAR_GRID_SPAN + 1 + i,
                        ).map((y) => {
                            const isSel = value.kind === "year" && value.anchor.getFullYear() === y;
                            return (
                                <Chip
                                    key={y} label={y}
                                    sx={{
                                        borderRadius: 2, height: 36, fontSize: 15,
                                        ...(y === now.getFullYear() && !isSel
                                            ? { color: "success.main", borderColor: "success.main" } : {}),
                                    }}
                                    color={isSel ? "primary" : undefined}
                                    variant={isSel ? "filled" : "outlined"}
                                    onClick={() => apply({ kind: "year", anchor: new Date(y, 0, 1) })}
                                />
                            );
                        })}
                    </Box>
                ) : (
                    <>
                        {/* The navigator states the year once, so the cells below only need
                        the month — "Aug 2026" in a third of a phone's width doesn't fit. */}
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
                                const monthStart = new Date(gridYear, m, 1);
                                // A month is "applied" whether it was picked from this grid
                                // or arrived as the equivalent custom range.
                                const isSel = (value.kind === "month"
                                    && value.anchor.getFullYear() === gridYear
                                    && value.anchor.getMonth() === m)
                                    || (value.kind === "custom"
                                        && value.from.getTime() === monthStart.getTime()
                                        && value.to.getTime() === endOfDay(endOfMonth(monthStart)).getTime());
                                const isNow = gridYear === now.getFullYear() && m === now.getMonth();
                                return (
                                    <Chip
                                        key={m} label={format(monthStart, "MMM")}
                                        sx={{
                                            borderRadius: 2, height: 36, fontSize: 15,
                                            ...(isNow && !isSel
                                                ? { color: "success.main", borderColor: "success.main" } : {}),
                                        }}
                                        color={isSel ? "primary" : undefined}
                                        variant={isSel ? "filled" : "outlined"}
                                        onClick={() => apply({ kind: "month", anchor: monthStart })}
                                    />
                                );
                            })}
                        </Box>
                    </>
                )}

                <Typography variant="subtitle2" sx={{ ...sectionLabelSx, display: "block", mt: 2.5, mb: 1.25 }}>
                    Custom range
                </Typography>
                {/* Stacked on a phone: two date fields and a button won't fit across the
                ~250px a dialog leaves, and flex children default to min-width:auto, so
                they'd overflow rather than shrink. */}
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.25}
                    alignItems={{ xs: "stretch", sm: "center" }}
                >
                    <DatePicker
                        label="From" value={customFrom} onChange={setCustomFrom}
                        slotProps={{ textField: { fullWidth: true } }}
                        sx={{ flex: 1, minWidth: 0 }}
                    />
                    <DatePicker
                        label="To" value={customTo} onChange={setCustomTo}
                        slotProps={{ textField: { fullWidth: true } }}
                        sx={{ flex: 1, minWidth: 0 }}
                    />
                    <Button
                        variant="contained" disabled={!customFrom && !customTo}
                        onClick={applyCustom} sx={{ flexShrink: 0 }}
                    >
                        Apply
                    </Button>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
