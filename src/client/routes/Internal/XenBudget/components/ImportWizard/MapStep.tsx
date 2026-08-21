import {
    Alert, Box, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import type { MappingConfig } from "../../../../../utils/csvMapping";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../../utils/currencyUtils";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";

interface MapStepProps {
    headers: string[];
    config: MappingConfig;
    onChange: (config: MappingConfig) => void;
    detectedOrder: "ymd" | "dmy" | "mdy";
    sampleDate?: string;
    errorCount: number;
    mappedCount: number;
}

const ORDER_LABELS: Record<string, string> = {
    ymd: "Year first (2026-08-21)",
    dmy: "Day first (21/08/2026)",
    mdy: "Month first (08/21/2026)",
};

export default function MapStep({
    headers, config, onChange, detectedOrder, sampleDate, errorCount, mappedCount,
}: MapStepProps) {
    const setColumn = (key: keyof MappingConfig["column_map"], value: string) =>
        onChange({ ...config, column_map: { ...config.column_map, [key]: value || undefined } });

    const columnSelect = (key: keyof MappingConfig["column_map"], label: string, required = false) => (
        <TextField
            select fullWidth size="small" label={label}
            value={config.column_map[key] ?? ""}
            onChange={(e) => setColumn(key, e.target.value)}
            error={required && !config.column_map[key]}
            slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
        >
            <MenuItem value="">{required ? "— required —" : "— none —"}</MenuItem>
            {headers.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
        </TextField>
    );

    return (
        <Stack spacing={2}>
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
                        ? `Detected: ${ORDER_LABELS[detectedOrder]}${sampleDate ? ` — "${sampleDate}" reads as ${ORDER_LABELS[detectedOrder].toLowerCase()}` : ""}`
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

            {errorCount > 0 && (
                <Alert severity="warning">
                    {mappedCount} row{mappedCount === 1 ? "" : "s"} map cleanly; {errorCount} could not be
                    read. You&rsquo;ll see why on the next step.
                </Alert>
            )}
        </Stack>
    );
}
