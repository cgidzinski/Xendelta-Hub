import {
    Alert, Box, FormControlLabel, MenuItem, Stack, Switch, TextField,
    ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { CsvRow, MappingConfig } from "../../../../../utils/csvMapping";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";

interface MapStepProps {
    headers: string[];
    config: MappingConfig;
    onChange: (config: MappingConfig) => void;
    detectedOrder: "ymd" | "dmy" | "mdy";
    /** The first data row, so a column can be picked by what's actually in it. */
    sampleRow?: CsvRow;
    errorCount: number;
    mappedCount: number;
    /** Optional cutoff: rows outside this range are excluded rather than dropped silently. */
    dateFrom: Date | null;
    onDateFromChange: (d: Date | null) => void;
    dateTo: Date | null;
    onDateToChange: (d: Date | null) => void;
}

const ORDER_LABELS: Record<string, string> = {
    ymd: "Year first (2026-08-21)",
    dmy: "Day first (21/08/2026)",
    mdy: "Month first (08/21/2026)",
};

export default function MapStep({
    headers, config, onChange, detectedOrder, sampleRow, errorCount, mappedCount,
    dateFrom, onDateFromChange, dateTo, onDateToChange,
}: MapStepProps) {
    const setColumn = (key: keyof MappingConfig["column_map"], value: string) =>
        onChange({ ...config, column_map: { ...config.column_map, [key]: value || undefined } });

    // A raw header name doesn't say much on its own — showing what's actually in the
    // first row turns "pick from a list of column names" into "see the data you're mapping".
    const columnSelect = (key: keyof MappingConfig["column_map"], label: string, required = false) => {
        const chosen = config.column_map[key];
        const sample = chosen && sampleRow ? sampleRow[chosen] : undefined;
        return (
            <TextField
                select fullWidth size="small" label={label}
                value={chosen ?? ""}
                onChange={(e) => setColumn(key, e.target.value)}
                error={required && !chosen}
                helperText={sample ? `"${sample}"` : undefined}
                slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
            >
                <MenuItem value="">{required ? "— required —" : "— none —"}</MenuItem>
                {headers.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
            </TextField>
        );
    };

    return (
        <Stack spacing={2}>
            <Typography variant="caption" sx={sectionLabelSx}>File structure</Typography>

            <Stack direction="row" spacing={2} alignItems="center">
                <FormControlLabel
                    control={
                        <Switch
                            checked={config.has_header !== false}
                            onChange={(e) => onChange({ ...config, has_header: e.target.checked })}
                        />
                    }
                    label="First row is a header"
                />
                <TextField
                    size="small" type="number" label="Skip rows before that"
                    value={config.skip_rows ?? 0}
                    onChange={(e) => onChange({ ...config, skip_rows: Math.max(0, Number(e.target.value) || 0) })}
                    sx={{ width: 170 }}
                    slotProps={{ htmlInput: { min: 0, max: 100 } }}
                    helperText="For files with junk rows above the real data"
                />
            </Stack>

            <Typography variant="caption" sx={sectionLabelSx}>Match your columns</Typography>

            {columnSelect("date", "Date", true)}
            {columnSelect("description", "Description", true)}

            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    How are amounts laid out?
                </Typography>
                <ToggleButtonGroup
                    size="small" exclusive fullWidth value={config.amount_mode}
                    onChange={(_, v) => v && onChange({ ...config, amount_mode: v })}
                >
                    <ToggleButton value="signed">One signed column</ToggleButton>
                    <ToggleButton value="debit_credit">Separate debit &amp; credit</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {config.amount_mode === "signed" ? (
                <>
                    {columnSelect("amount", "Amount", true)}
                    <TextField
                        select fullWidth size="small" label="Which sign means money out?"
                        value={config.sign_convention}
                        onChange={(e) => onChange({ ...config, sign_convention: e.target.value as MappingConfig["sign_convention"] })}
                        slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                    >
                        <MenuItem value="negative_is_expense">Negative is spending (most banks)</MenuItem>
                        <MenuItem value="positive_is_expense">Positive is spending (some card statements)</MenuItem>
                    </TextField>
                </>
            ) : (
                <Stack direction="row" spacing={1}>
                    {columnSelect("debit", "Debit (money out)", true)}
                    {columnSelect("credit", "Credit (money in)")}
                </Stack>
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

            {columnSelect("categories", "Category (optional)")}

            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Only import rows within this range (optional) — everything else stays visible on
                    the next step, just unticked.
                </Typography>
                <Stack direction="row" spacing={1}>
                    <DatePicker
                        label="From" value={dateFrom} onChange={onDateFromChange}
                        slotProps={{ textField: { size: "small", fullWidth: true } }}
                    />
                    <DatePicker
                        label="To" value={dateTo} onChange={onDateToChange}
                        slotProps={{ textField: { size: "small", fullWidth: true } }}
                    />
                </Stack>
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
