import { useState } from "react";
import {
    Alert, Box, Button, Checkbox, Chip, FormControlLabel, IconButton, MenuItem, Stack, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { ColumnMap, CsvRow, MappingConfig } from "../../../../../utils/csvMapping";
import type { DateStats } from "./index";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { chartColorAt } from "../../../../../components/ui/chartColors";

interface MapStepProps {
    headers: string[];
    config: MappingConfig;
    onChange: (config: MappingConfig) => void;
    detectedOrder: "ymd" | "dmy" | "mdy";
    /** Parsed data rows, so a column can be picked by what's actually in it — and so the
     *  user can step through a few of them to sanity-check the mapping. */
    rows: CsvRow[];
    /** The first few raw lines of the file, exactly as they appear on disk, before any
     *  header/skip-rows interpretation — lets the user see junk rows for themselves. */
    rawPreviewLines: string[];
    errorCount: number;
    mappedCount: number;
    /** Rows inside the currently selected date range — shown on the "Custom range" toggle. */
    customRangeCount: number;
    /** The file's own date span and majority month, or null until a Date column is mapped. */
    dateStats: DateStats | null;
    /** Optional cutoff: rows outside this range are excluded rather than dropped silently. */
    dateFrom: Date | null;
    onDateFromChange: (d: Date | null) => void;
    dateTo: Date | null;
    onDateToChange: (d: Date | null) => void;
    /** Hide the "Which rows to import" date-range section (e.g. editing a preset). */
    showDateRange?: boolean;
    /** Hide the "X of Y" row counter and chevrons (no sample rows to step through). */
    showRowNav?: boolean;
    /** Read-only mapping controls — used when a saved mapping is selected. */
    locked?: boolean;
}

/** Formats a parsed row date (a date-only value anchored at UTC midnight) as a plain
 *  calendar day, without letting the viewer's own timezone shift it onto the next day. */
function fmtUTCDate(d: Date, withYear = false): string {
    return d.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC",
    });
}

/** Splits one raw CSV line into fields, respecting double-quoted fields that contain a
 *  comma (a quoted description is common enough in bank exports that a naive split would
 *  misalign the preview's colour-per-column against the real columns). */
function splitCsvLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
            } else {
                cur += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            fields.push(cur);
            cur = "";
        } else {
            cur += c;
        }
    }
    fields.push(cur);
    return fields;
}

const ORDER_LABELS: Record<string, string> = {
    ymd: "Year first (2026-08-21)",
    dmy: "Day first (21/08/2026)",
    mdy: "Month first (08/21/2026)",
};

export default function MapStep({
    headers, config, onChange, detectedOrder, rows, rawPreviewLines, errorCount, mappedCount,
    customRangeCount, dateStats, dateFrom, onDateFromChange, dateTo, onDateToChange,
    showDateRange = true, showRowNav = true, locked = false,
}: MapStepProps) {
    const [previewIndex, setPreviewIndex] = useState(0);
    const rowIndex = rows.length ? Math.min(previewIndex, rows.length - 1) : 0;
    const sampleRow = rows[rowIndex];
    const isMobile = useMediaQuery("(max-width:600px)");

    const [customOpen, setCustomOpen] = useState(false);
    const matchesRange = (from: Date, to: Date) =>
        !!dateFrom && !!dateTo && dateFrom.getTime() === from.getTime() && dateTo.getTime() === to.getTime();
    const isAll = !!dateStats && matchesRange(dateStats.from, dateStats.to);
    // The month (if any) whose exact range is currently selected.
    const activeMonth = dateStats?.months.find((m) => matchesRange(m.from, m.to));
    // Anything that isn't a listed month or the full range is, by definition, a custom
    // range — surface the fields for it even if the toggle was never clicked.
    const isCustom = !!dateStats && !!dateFrom && !!dateTo && !isAll && !activeMonth;

    // Raw preview fields per line, plus the widest column count across the sample lines.
    const rawParsed = rawPreviewLines.map(splitCsvLine);
    const rawColCount = rawParsed.reduce((m, r) => Math.max(m, r.length), 0);

    const roleOptions: { value: keyof ColumnMap | "skip"; label: string }[] = [
        { value: "skip", label: "Skip" },
        { value: "date", label: "Date" },
        { value: "description", label: "Description" },
        { value: "memo", label: "Memo" },
        { value: "amount", label: "Amount" },
        { value: "debit", label: "Debit (money out)" },
        { value: "credit", label: "Credit (money in)" },
        { value: "categories", label: "Category" },
    ];

    // column_map is field -> header, so a column's current role is whichever field (if
    // any) currently points back at it.
    const roleForHeader = (header: string): string => {
        const entry = (Object.entries(config.column_map) as [keyof ColumnMap, string | undefined][])
            .find(([, v]) => v === header);
        return entry ? entry[0] : "skip";
    };

    const assignRole = (header: string, role: string) => {
        const next: ColumnMap = { ...config.column_map };
        (Object.keys(next) as (keyof ColumnMap)[]).forEach((key) => {
            if (next[key] === header) delete next[key];
        });
        if (role && role !== "skip") next[role as keyof ColumnMap] = header;
        onChange({ ...config, column_map: next });
    };

    const missingRequired = !config.column_map.date || !config.column_map.description
        || (!config.column_map.amount && !config.column_map.debit && !config.column_map.credit);

    return (
        <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" sx={sectionLabelSx}>File structure</Typography>
                <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                        <Checkbox
                            size="small"
                            checked={config.has_header === false}
                            onChange={(e) => onChange({ ...config, has_header: !e.target.checked })}
                        />
                    }
                    label="No header"
                />
            </Stack>

            {rawPreviewLines.length > 0 && (
                <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 0.75, overflowX: "auto" }}>
                    <Box
                        component="table"
                        sx={{
                            borderCollapse: "collapse",
                            fontFamily: "monospace",
                            fontSize: 11,
                            lineHeight: 1.35,
                        }}
                    >
                        <Box component="tbody">
                            {rawParsed.map((fields, row) => (
                                <Box component="tr" key={row}>
                                    {Array.from({ length: rawColCount }, (_, col) => (
                                        <Box
                                            component="td"
                                            key={col}
                                            sx={{
                                                px: 1,
                                                py: 0,
                                                whiteSpace: "nowrap",
                                                color: chartColorAt(col),
                                                borderRight: col < rawColCount - 1 ? "1px solid" : undefined,
                                                borderColor: "divider",
                                            }}
                                        >
                                            {fields[col] ? fields[col] : "\u00A0"}
                                        </Box>
                                    ))}
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Box>
            )}

            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" sx={sectionLabelSx}>Match your columns</Typography>
                {showRowNav && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                            {rows.length ? rowIndex + 1 : 0} of {rows.length}
                        </Typography>
                        <IconButton
                            size="small" disabled={rowIndex <= 0}
                            onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                        >
                            <ChevronLeftIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small" disabled={rowIndex >= rows.length - 1}
                            onClick={() => setPreviewIndex((i) => Math.min(rows.length - 1, i + 1))}
                        >
                            <ChevronRightIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                )}
            </Stack>

            {locked && (
                <Typography variant="caption" color="text.secondary">
                    Using a saved mapping — column matching is locked.
                </Typography>
            )}

            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Value</TableCell>
                            <TableCell width="45%">Maps to</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {headers.map((h) => {
                            const value = sampleRow ? sampleRow[h] : undefined;
                            return (
                                <TableRow key={h}>
                                    <TableCell sx={{ maxWidth: 0 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                                            {h}
                                        </Typography>
                                        <Typography variant="body2" noWrap title={value || undefined}>
                                            {value || "—"}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            select fullWidth size="small"
                                            value={roleForHeader(h)}
                                            onChange={(e) => assignRole(h, e.target.value)}
                                            disabled={locked}
                                            slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                                        >
                                            {roleOptions.map((r) => (
                                                <MenuItem key={r.value || "none"} value={r.value}>{r.label}</MenuItem>
                                            ))}
                                        </TextField>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {missingRequired && (
                <Typography variant="caption" color="error">
                    Date, Description, and at least one of Amount, Debit, or Credit must be mapped to a
                    column above.
                </Typography>
            )}

            {!!config.column_map.amount && (
                <TextField
                    select fullWidth size="small" label="Which sign means money out?"
                    value={config.sign_convention}
                    onChange={(e) => onChange({ ...config, sign_convention: e.target.value as MappingConfig["sign_convention"] })}
                    disabled={locked}
                    slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                >
                    <MenuItem value="negative_is_expense">Negative is spending</MenuItem>
                    <MenuItem value="positive_is_expense">Positive is spending</MenuItem>
                </TextField>
            )}

            <TextField
                select fullWidth size="small" label="Date order"
                value={config.date_format === "auto" ? "auto" : config.date_format}
                onChange={(e) => onChange({ ...config, date_format: e.target.value })}
                disabled={locked}
                helperText={
                    config.date_format === "auto"
                        ? `Detected: ${ORDER_LABELS[detectedOrder]}`
                        : undefined
                }
                slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
            >
                <MenuItem value="auto">Detect automatically</MenuItem>
                <MenuItem value="ymd">{ORDER_LABELS.ymd}</MenuItem>
                <MenuItem value="dmy">{ORDER_LABELS.dmy}</MenuItem>
                <MenuItem value="mdy">{ORDER_LABELS.mdy}</MenuItem>
            </TextField>

            {showDateRange && (
                <Box>
                    <Typography variant="caption" sx={sectionLabelSx}>Which rows to import</Typography>
                    <Box sx={{ mt: 0.75 }}>
                        {dateStats ? (
                            <>
                                <Stack
                                    direction="row" alignItems="center" justifyContent="space-between" spacing={1}
                                    sx={{
                                        flexWrap: "wrap", rowGap: 0.5, bgcolor: "action.hover",
                                        border: 1, borderColor: "divider", borderRadius: 1, px: 1.5, py: 1,
                                    }}
                                >
                                    <Typography variant="body2">
                                        Found dates from <b>{fmtUTCDate(dateStats.from)}</b> to{" "}
                                        <b>{fmtUTCDate(dateStats.to, true)}</b> in your file.
                                    </Typography>
                                    <Chip
                                        size="small" variant="outlined" color="success"
                                        label={`${dateStats.totalCount} row${dateStats.totalCount === 1 ? "" : "s"}`}
                                        sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}
                                    />
                                </Stack>

                                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5, mt: 1.25 }}>
                                    {dateStats.months.map((m) => {
                                        const selected = !customOpen && !isAll && activeMonth?.key === m.key;
                                        return (
                                            <Button
                                                key={m.key}
                                                size="small"
                                                variant={selected ? "contained" : "outlined"}
                                                sx={{ flexGrow: 1 }}
                                                onClick={() => {
                                                    setCustomOpen(false);
                                                    onDateFromChange(m.from);
                                                    onDateToChange(m.to);
                                                }}
                                            >
                                                {m.label} · {m.count}
                                            </Button>
                                        );
                                    })}
                                    <Button
                                        size="small"
                                        variant={isAll ? "contained" : "outlined"}
                                        sx={{ flexGrow: 1 }}
                                        onClick={() => {
                                            setCustomOpen(false);
                                            onDateFromChange(dateStats.from);
                                            onDateToChange(dateStats.to);
                                        }}
                                    >
                                        All dates · {dateStats.totalCount}
                                    </Button>
                                    <Button
                                        size="small"
                                        variant={(customOpen || isCustom) ? "contained" : "outlined"}
                                        sx={{ flexGrow: 1 }}
                                        onClick={() => setCustomOpen(true)}
                                    >
                                        Custom range · {customRangeCount}
                                    </Button>
                                </Stack>

                                {!isAll && !isCustom && activeMonth && dateStats.totalCount > activeMonth.count && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                                        The other {dateStats.totalCount - activeMonth.count} stay
                                        visible on the next step, just unticked.
                                    </Typography>
                                )}

                                {(customOpen || isCustom) && (
                                    <Stack direction={isMobile ? "column" : "row"} spacing={1} sx={{ mt: 1 }}>
                                        <DatePicker label="From" value={dateFrom} onChange={onDateFromChange} />
                                        <DatePicker label="To" value={dateTo} onChange={onDateToChange} />
                                    </Stack>
                                )}
                            </>
                        ) : (
                            <Typography variant="caption" color="text.secondary">
                                Once a Date column is mapped above, you can trim which rows import here.
                            </Typography>
                        )}
                    </Box>
                </Box>
            )}

            {errorCount > 0 && (
                <Alert severity="warning">
                    {mappedCount} row{mappedCount === 1 ? "" : "s"} map cleanly; {errorCount} could not be
                    read. You&rsquo;ll see why on the next step.
                </Alert>
            )}
        </Stack>
    );
}
