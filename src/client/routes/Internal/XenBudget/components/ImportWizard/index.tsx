import { useEffect, useMemo, useState } from "react";
import {
    Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, MenuItem, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Papa from "papaparse";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, ImportPreviewRow, DuplicateMatch, BulkImportResult,
} from "../../../../../hooks/xenbudget/types";
import { useXenBudgetImport, type ImportCandidate } from "../../../../../hooks/xenbudget/useImport";
import {
    applyMapping, detectDateFormat, type MappingConfig, type MappingError, type CsvRow,
} from "../../../../../utils/csvMapping";
import MapStep from "./MapStep";
import PreviewStep from "./PreviewStep";
import LoadingSpinner from "../../../../../components/LoadingSpinner";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../../utils/currencyUtils";

const STEPS = ["Upload", "Map columns", "Review", "Done"];

const blankConfig = (): MappingConfig => ({
    column_map: {},
    amount_mode: "signed",
    sign_convention: "negative_is_expense",
    date_format: "auto",
});

interface ImportWizardProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
}

/**
 * The CSV import flow: upload → map → review → import.
 *
 * The file is parsed in the browser, which is what lets the mapping step show real column
 * headers and a live preview without uploading a bank statement anywhere. Only the mapped
 * rows are sent, and the rules that decide their final shape run on the server — so the
 * preview and the import can never disagree about what a rule does.
 */
export default function ImportWizard({ open, onClose, book }: ImportWizardProps) {
    const { enqueueSnackbar } = useSnackbar();
    const {
        previewAsync, isPreviewing, checkDuplicatesAsync, importAsync, isImporting,
        undoImportAsync, isUndoing, savePresetAsync,
    } = useXenBudgetImport(book._id);

    const [step, setStep] = useState(0);
    const [fileName, setFileName] = useState("");
    const [rawRows, setRawRows] = useState<CsvRow[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [config, setConfig] = useState<MappingConfig>(blankConfig());
    const [previews, setPreviews] = useState<ImportPreviewRow[]>([]);
    const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [result, setResult] = useState<BulkImportResult | null>(null);
    const [savePresetName, setSavePresetName] = useState("");
    const [presetId, setPresetId] = useState("");

    useEffect(() => {
        if (open) return;
        setStep(0);
        setFileName("");
        setRawRows([]);
        setHeaders([]);
        setConfig(blankConfig());
        setPreviews([]);
        setDuplicates([]);
        setSelected(new Set());
        setResult(null);
        setSavePresetName("");
        setPresetId("");
    }, [open]);

    const mapped = useMemo(
        () => (rawRows.length ? applyMapping(rawRows, config) : { rows: [], errors: [] as MappingError[] }),
        [rawRows, config],
    );

    const detectedOrder = useMemo(
        () => detectDateFormat(rawRows.map((r) => (config.column_map.date ? r[config.column_map.date] : ""))),
        [rawRows, config.column_map.date],
    );

    const canMap = !!config.column_map.date && !!config.column_map.description
        && (config.amount_mode === "signed" ? !!config.column_map.amount : !!config.column_map.debit);

    const handleFile = (file: File) => {
        setFileName(file.name);
        Papa.parse<CsvRow>(file, {
            header: true,
            skipEmptyLines: "greedy",
            complete: (parsed) => {
                const fields = (parsed.meta.fields || []).filter(Boolean);
                setHeaders(fields);
                setRawRows(parsed.data as CsvRow[]);
                // Guess the obvious columns so the common case is one click.
                const guess = (candidates: string[]) =>
                    fields.find((f) => candidates.some((c) => f.toLowerCase().includes(c)));
                setConfig((prev) => ({
                    ...prev,
                    column_map: {
                        date: guess(["date", "posted"]),
                        description: guess(["description", "payee", "merchant", "name", "memo"]),
                        amount: guess(["amount", "value"]),
                        debit: guess(["debit", "withdrawal"]),
                        credit: guess(["credit", "deposit"]),
                    },
                }));
                setStep(1);
            },
            error: (err) => enqueueSnackbar(`Could not read that file: ${err.message}`, { variant: "error" }),
        });
    };

    const applyPreset = (id: string) => {
        setPresetId(id);
        const preset = book.import_presets.find((p) => p._id === id);
        if (!preset) return;
        setConfig({
            column_map: { ...preset.column_map },
            amount_mode: preset.amount_mode,
            sign_convention: preset.sign_convention,
            date_format: preset.date_format || "auto",
            default_tags: preset.default_tags,
        });
    };

    const toCandidates = (): ImportCandidate[] => mapped.rows.map((r) => ({
        type: r.type,
        amount: r.amount,
        date: r.date,
        description: r.description,
        tags: r.tags,
        currency: book.default_currency,
    }));

    const goToReview = async () => {
        try {
            const candidates = toCandidates();
            if (candidates.length === 0) {
                enqueueSnackbar("No rows could be read with that mapping", { variant: "warning" });
                return;
            }
            const [preview, dupes] = await Promise.all([
                previewAsync(candidates),
                checkDuplicatesAsync(candidates.map((c) => ({
                    amount: c.amount, date: c.date, description: c.description,
                }))),
            ]);
            setPreviews(preview.previews);
            setDuplicates(dupes);
            // Everything a rule would keep is ticked, except likely duplicates — those
            // start unticked so a re-import doesn't double the month by default.
            const dupeIndices = new Set(dupes.map((d) => d.index));
            setSelected(new Set(
                preview.previews.filter((p) => !p.skipped && !dupeIndices.has(p.index)).map((p) => p.index),
            ));
            setStep(2);
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Could not build a preview", { variant: "error" });
        }
    };

    const doImport = async () => {
        try {
            const candidates = toCandidates();
            // `index` is the row's position in the mapped list, which is what the preview
            // and duplicate results are keyed by.
            const chosen = candidates.filter((_, i) => selected.has(mapped.rows[i].index));
            const imported = await importAsync(chosen);
            setResult(imported);
            setStep(3);
            if (savePresetName.trim()) {
                await savePresetAsync({
                    name: savePresetName.trim(),
                    column_map: config.column_map,
                    amount_mode: config.amount_mode,
                    sign_convention: config.sign_convention,
                    date_format: config.date_format,
                    default_tags: config.default_tags,
                }).catch(() => enqueueSnackbar("Imported, but the preset could not be saved", { variant: "warning" }));
            }
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Import failed", { variant: "error" });
        }
    };

    const undo = async () => {
        if (!result) return;
        try {
            await undoImportAsync(result.batch_id);
            enqueueSnackbar("Import undone", { variant: "success" });
            onClose();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Could not undo", { variant: "error" });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Import a CSV</DialogTitle>
            <DialogContent>
                <Stepper activeStep={step} sx={{ mb: 3 }}>
                    {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                </Stepper>

                {step === 0 && (
                    <Stack spacing={2} alignItems="flex-start">
                        <Typography variant="body2" color="text.secondary">
                            Export from your bank or card as CSV. The file is read here in your browser —
                            only the rows you approve are sent.
                        </Typography>
                        {book.import_presets.length > 0 && (
                            <TextField
                                select fullWidth size="small" label="Use a saved mapping"
                                value={presetId} onChange={(e) => applyPreset(e.target.value)}
                                slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
                            >
                                <MenuItem value="">— set it up manually —</MenuItem>
                                {book.import_presets.map((p) => (
                                    <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                                ))}
                            </TextField>
                        )}
                        <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                            Choose CSV
                            <input
                                type="file" hidden accept=".csv,text/csv"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                            />
                        </Button>
                        {fileName && <Typography variant="caption">{fileName}</Typography>}
                    </Stack>
                )}

                {step === 1 && (
                    <MapStep
                        headers={headers}
                        config={config}
                        onChange={setConfig}
                        detectedOrder={detectedOrder}
                        sampleDate={config.column_map.date ? rawRows[0]?.[config.column_map.date] : undefined}
                        errorCount={mapped.errors.length}
                        mappedCount={mapped.rows.length}
                    />
                )}

                {step === 2 && (isPreviewing ? (
                    <LoadingSpinner message="Running your rules over these rows..." />
                ) : (
                    <Stack spacing={2}>
                        <PreviewStep
                            previews={previews}
                            duplicates={duplicates}
                            errors={mapped.errors}
                            tagRegistry={book.tags}
                            currency={book.default_currency}
                            selected={selected}
                            onToggle={(index) => setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index); else next.add(index);
                                return next;
                            })}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small" checked={savePresetName !== ""}
                                    onChange={(e) => setSavePresetName(e.target.checked ? fileName.replace(/\.csv$/i, "") : "")}
                                />
                            }
                            label="Remember this mapping for next time"
                        />
                        {savePresetName !== "" && (
                            <TextField
                                size="small" label="Mapping name" value={savePresetName}
                                onChange={(e) => setSavePresetName(e.target.value)}
                                placeholder="Chase Visa"
                            />
                        )}
                    </Stack>
                ))}

                {step === 3 && result && (
                    <Stack spacing={2}>
                        <Alert severity="success">
                            Imported {result.created} item{result.created === 1 ? "" : "s"}.
                        </Alert>
                        {result.excluded > 0 && (
                            <Typography variant="body2" color="text.secondary">
                                {result.excluded} were excluded from totals by a rule — they&rsquo;re still
                                listed, greyed out, on the items tab.
                            </Typography>
                        )}
                        {result.flagged > 0 && (
                            <Typography variant="body2" color="text.secondary">
                                {result.flagged} were flagged for review. Find them under &ldquo;Needs
                                review&rdquo; on the items tab.
                            </Typography>
                        )}
                        {result.skipped.length > 0 && (
                            <Typography variant="body2" color="text.secondary">
                                {result.skipped.length} were not imported at all, by rule{" "}
                                {[...new Set(result.skipped.map((s) => s.rule))].map((r) => `"${r}"`).join(", ")}.
                            </Typography>
                        )}
                        {result.failed.length > 0 && (
                            <Alert severity="warning">
                                {result.failed.length} row{result.failed.length === 1 ? "" : "s"} could not be
                                saved: {[...new Set(result.failed.map((f) => f.reason))].join("; ")}
                            </Alert>
                        )}
                        <Box>
                            <Button color="error" onClick={undo} disabled={isUndoing}>
                                Undo this import
                            </Button>
                        </Box>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                {step > 0 && step < 3 && (
                    <Button onClick={() => setStep(step - 1)} sx={{ mr: "auto" }}>Back</Button>
                )}
                <Button onClick={onClose}>{step === 3 ? "Done" : "Cancel"}</Button>
                {step === 1 && (
                    <Button variant="contained" disabled={!canMap || mapped.rows.length === 0} onClick={goToReview}>
                        Review {mapped.rows.length} row{mapped.rows.length === 1 ? "" : "s"}
                    </Button>
                )}
                {step === 2 && (
                    <Button variant="contained" disabled={selected.size === 0 || isImporting} onClick={doImport}>
                        Import {selected.size} item{selected.size === 1 ? "" : "s"}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
