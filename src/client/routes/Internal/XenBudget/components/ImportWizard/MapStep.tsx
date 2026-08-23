import { useState } from "react";
import {
    Alert, Box, Button, Checkbox, Chip, FormControlLabel, IconButton, MenuItem, Stack, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton,
    ToggleButtonGroup, Typography,
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
    /** The file's own date span and majority month, or null until a Date column is mapped. */
    dateStats: DateStats | null;
    /** Optional cutoff: rows outside this range are excluded rather than dropped silently. */
    dateFrom: Date | null;
    onDateFromChange: (d: Date | null) => void;
    dateTo: Date | null;
    onDateToChange: (d: Date | null) => void;
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

const AMOUNT_ROLES: Record<MappingConfig["amount_mode"], { value: keyof ColumnMap; label: string }[]> = {
    signed: [{ value: "amount", label: "Amount" }],
    debit_credit: [
        { value: "debit", label: "Debit (money out)" },
        { value: "credit", label: "Credit (money in)" },
    ],
};

export default function MapStep({
    headers, config, onChange, detectedOrder, rows, rawPreviewLines, errorCount, mappedCount,
    dateStats, dateFrom, onDateFromChange, dateTo, onDateToChange,
}: MapStepProps) {
    const [previewIndex, setPreviewIndex] = useState(0);
    const rowIndex = rows.length ? Math.min(previewIndex, rows.length - 1) : 0;
    const sampleRow = rows[rowIndex];
    const isMobile = useMediaQuery("(max-width:600px)");

    const [customOpen, setCustomOpen] = useState(false);
    const matchesRange = (from: Date, to: Date) =>
        !!dateFrom && !!dateTo && dateFrom.getTime() === from.getTime() && dateTo.getTime() === to.getTime();
    const isAll = !!dateStats && matchesRange(dateStats.from, dateStats.to);
    const isMajority = !!dateStats && matchesRange(dateStats.majority.from, dateStats.majority.to);
    // Anything that isn't one of the two canonical choices is, by definition, a custom
    // range — surface the fields for it even if the toggle above was never clicked (e.g.
    // a preset-free reopen, or the majority month shifting after a column fix).
    const isCustom = !!dateStats && !!dateFrom && !!dateTo && !isAll && !isMajority;

    const roleOptions: { value: keyof ColumnMap | ""; label: string }[] = [
        { value: "", label: "— unused —" },
        { value: "date", label: "Date" },
        { value: "description", label: "Description" },
        ...AMOUNT_ROLES[config.amount_mode],
        { value: "categories", label: "Category" },
    ];

    // column_map is field -> header, so a column's current role is whichever field (if
    // any) currently points back at it.
    const roleForHeader = (header: string): string => {
        const entry = (Object.entries(config.column_map) as [keyof ColumnMap, string | undefined][])
            .find(([, v]) => v === header);
        return entry ? entry[0] : "";
    };

    const assignRole = (header: string, role: string) => {
        const next: ColumnMap = { ...config.column_map };
        (Object.keys(next) as (keyof ColumnMap)[]).forEach((key) => {
            if (next[key] === header) delete next[key];
        });
        if (role) next[role as keyof ColumnMap] = header;
        onChange({ ...config, column_map: next });
    };

    const missingRequired = !config.column_map.date || !config.column_map.description
        || (config.amount_mode === "signed" ? !config.column_map.amount : !config.column_map.debit);

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
                <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1, overflowX: "auto" }}>
                    {rawPreviewLines.map((line, i) => (
                        <Typography
                            key={i} variant="caption" component="div"
                            sx={{ fontFamily: "monospace", whiteSpace: "pre" }}
                        >
                            {config.has_header === false || !line ? (
                                line || " "
                            ) : (
                                splitCsvLine(line).map((field, fi) => (
                                    <Box key={fi} component="span">
                                        {fi > 0 && <Box component="span" sx={{ color: "text.disabled" }}>,</Box>}
                                        <Box component="span" sx={{ color: chartColorAt(fi) }}>{field}</Box>
                                    </Box>
                                ))
                            )}
                        </Typography>
                    ))}
                </Box>
            )}

            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" sx={sectionLabelSx}>Match your columns</Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                        Checking row {rows.length ? rowIndex + 1 : 0} of {rows.length}
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
            </Stack>

            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    How are amounts laid out?
                </Typography>
                <ToggleButtonGroup
                    size="small" exclusive fullWidth value={config.amount_mode}
                    onChange={(_, v) => v && onChange({
                        ...config,
                        amount_mode: v,
                        column_map: {
                            ...config.column_map,
                            ...(v === "signed" ? { debit: undefined, credit: undefined } : { amount: undefined }),
                        },
                    })}
                >
                    <ToggleButton value="signed">One signed column</ToggleButton>
                    <ToggleButton value="debit_credit">Separate debit &amp; credit</ToggleButton>
                </ToggleButtonGroup>
            </Box>

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
                    Date, Description, and {config.amount_mode === "signed" ? "Amount" : "Debit"} must all be
                    mapped to a column above.
                </Typography>
            )}

            {config.amount_mode === "signed" && (
                <TextField
                    select fullWidth size="small" label="Which sign means money out?"
                    value={config.sign_convention}
                    onChange={(e) => onChange({ ...config, sign_convention: e.target.value as MappingConfig["sign_convention"] })}
                    slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                >
                    <MenuItem value="negative_is_expense">Negative is spending (most banks)</MenuItem>
                    <MenuItem value="positive_is_expense">Positive is spending (some card statements)</MenuItem>
                </TextField>
            )}

            <TextField
                select fullWidth size="small" label="Date order"
                value={config.date_format === "auto" ? "auto" : config.date_format}
                onChange={(e) => onChange({ ...config, date_format: e.target.value })}
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

                            <ToggleButtonGroup
                                size="small" exclusive fullWidth
                                value={isAll ? "all" : "month"}
                                sx={{ mt: 1.25 }}
                                onChange={(_, v) => {
                                    if (!v) return;
                                    setCustomOpen(false);
                                    if (v === "all") {
                                        onDateFromChange(dateStats.from);
                                        onDateToChange(dateStats.to);
                                    } else {
                                        onDateFromChange(dateStats.majority.from);
                                        onDateToChange(dateStats.majority.to);
                                    }
                                }}
                            >
                                <ToggleButton value="month">{dateStats.majority.label}</ToggleButton>
                                <ToggleButton value="all">All dates</ToggleButton>
                            </ToggleButtonGroup>

                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                                {isAll ? (
                                    <>Importing the full range — all {dateStats.totalCount} rows.</>
                                ) : (
                                    <>
                                        Importing {fmtUTCDate(dateStats.majority.from)}&ndash;
                                        {fmtUTCDate(dateStats.majority.to)} — {dateStats.majority.count} row
                                        {dateStats.majority.count === 1 ? "" : "s"}.
                                        {dateStats.totalCount > dateStats.majority.count && (
                                            <> The other {dateStats.totalCount - dateStats.majority.count} stay
                                                visible on the next step, just unticked.</>
                                        )}
                                    </>
                                )}
                            </Typography>

                            {!isCustom && (
                                <Stack direction="row" justifyContent="center" sx={{ mt: 0.25 }}>
                                    <Button size="small" onClick={() => setCustomOpen((v) => !v)}>
                                        {customOpen ? "Hide custom range" : "Or pick a custom range"}
                                    </Button>
                                </Stack>
                            )}

                            {(customOpen || isCustom) && (
                                <Stack direction={isMobile ? "column" : "row"} spacing={1} sx={{ mt: 1 }}>
                                    <DatePicker
                                        label="From" value={dateFrom} onChange={onDateFromChange}
                                        slotProps={{ textField: { fullWidth: true } }}
                                    />
                                    <DatePicker
                                        label="To" value={dateTo} onChange={onDateToChange}
                                        slotProps={{ textField: { fullWidth: true } }}
                                    />
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

            {errorCount > 0 && (
                <Alert severity="warning">
                    {mappedCount} row{mappedCount === 1 ? "" : "s"} map cleanly; {errorCount} could not be
                    read. You&rsquo;ll see why on the next step.
                </Alert>
            )}
        </Stack>
    );
}
