import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, IconButton, MenuItem, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseIcon from "@mui/icons-material/Close";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import Papa from "papaparse";
import { useSnackbar } from "notistack";
import type {
    XenBudgetBook, XenBudgetImportPreset, ImportPreviewRow, DuplicateMatch, BulkImportResult,
} from "../../../../../hooks/xenbudget/types";
import { useXenBudgetImport, type ImportCandidate } from "../../../../../hooks/xenbudget/useImport";
import { useAuth } from "../../../../../contexts/AuthContext";
import {
    applyMapping, detectDateFormat, type MappingConfig, type MappingError, type CsvRow,
} from "../../../../../utils/csvMapping";
import MapStep from "./MapStep";
import PreviewStep from "./PreviewStep";
import WeightedSplitEditor, { type SplitDraft } from "../WeightedSplitEditor";
import LoadingSpinner from "../../../../../components/LoadingSpinner";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../../utils/currencyUtils";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";

const STEPS = ["Upload", "Map columns", "Review", "Done"];

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const blankConfig = (): MappingConfig => ({
    column_map: {},
    amount_mode: "signed",
    sign_convention: "negative_is_expense",
    date_format: "auto",
    has_header: true,
    skip_rows: 0,
});

export interface DateStats {
    from: Date;
    to: Date;
    totalCount: number;
    majority: { from: Date; to: Date; count: number; label: string };
}

interface ImportWizardProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
}

// Papaparse always treats the string it's given as the whole file, so a "skip N rows"
// option has to happen at the text level, before parsing — slicing raw lines rather than
// asking Papaparse to do it keeps the header-detection and no-header paths identical.
async function parseOneFile(
    file: File, hasHeader: boolean, skipRows: number,
): Promise<{ headers: string[]; rows: CsvRow[] }> {
    const text = await file.text();
    const lines = text.split(/\r\n|\n|\r/);
    const sliced = lines.slice(skipRows).join("\n");
    return new Promise((resolve, reject) => {
        Papa.parse<any>(sliced, {
            header: hasHeader,
            skipEmptyLines: "greedy",
            complete: (parsed) => {
                if (hasHeader) {
                    const fields = (parsed.meta.fields || []).filter(Boolean);
                    resolve({ headers: fields, rows: parsed.data as CsvRow[] });
                } else {
                    // No real header to name columns by, so synthesize one per position —
                    // the rest of the mapping UI needs headers to exist either way.
                    const dataRows = parsed.data as string[][];
                    const width = dataRows.reduce((max, r) => Math.max(max, r.length), 0);
                    const fields = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
                    const rows: CsvRow[] = dataRows.map((r) => {
                        const obj: CsvRow = {};
                        fields.forEach((f, i) => { obj[f] = r[i] ?? ""; });
                        return obj;
                    });
                    resolve({ headers: fields, rows });
                }
            },
            error: (err: Error) => reject(err),
        });
    });
}

// A book's month can arrive as two exports from the same card (a mid-month card swap, a
// statement cycle that doesn't line up with the calendar) — merging them here means the
// rest of the wizard never has to know there was more than one file. They're required to
// share the same columns: silently unioning mismatched files would misalign data no one
// asked to misalign.
async function parseAllFiles(
    files: File[], hasHeader: boolean, skipRows: number,
): Promise<{ headers: string[]; rows: CsvRow[]; error?: string }> {
    if (files.length === 0) return { headers: [], rows: [] };
    const parsed = await Promise.all(files.map((f) => parseOneFile(f, hasHeader, skipRows)));
    const first = parsed[0];
    for (let i = 1; i < parsed.length; i++) {
        const sameShape = parsed[i].headers.length === first.headers.length
            && parsed[i].headers.every((h, idx) => h === first.headers[idx]);
        if (!sameShape) {
            return {
                headers: [], rows: [],
                error: `"${files[i].name}" has different columns than "${files[0].name}" — pick files from the same export.`,
            };
        }
    }
    return { headers: first.headers, rows: parsed.flatMap((p) => p.rows) };
}

// Only column_map/amount_mode/sign_convention/date_format/has_header/skip_rows/
// default_categories are what a preset actually remembers — comparing exactly those (and
// nothing else) is what lets "unchanged" and "modified" be told apart.
function configMatchesPreset(config: MappingConfig, preset: XenBudgetImportPreset): boolean {
    const sameColumnMap = JSON.stringify(config.column_map) === JSON.stringify(preset.column_map);
    const sameDefaults = JSON.stringify(config.default_categories || [])
        === JSON.stringify(preset.default_categories || []);
    return sameColumnMap
        && config.amount_mode === preset.amount_mode
        && config.sign_convention === preset.sign_convention
        && (config.date_format || "auto") === (preset.date_format || "auto")
        && (config.has_header !== false) === preset.has_header
        && (config.skip_rows || 0) === preset.skip_rows
        && sameDefaults;
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
        undoImportAsync, isUndoing, savePresetAsync, updatePresetAsync,
    } = useXenBudgetImport(book._id);

    const [step, setStep] = useState(0);
    const [files, setFiles] = useState<File[]>([]);
    const [rawRows, setRawRows] = useState<CsvRow[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [parseError, setParseError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [config, setConfig] = useState<MappingConfig>(blankConfig());
    const [dateFrom, setDateFrom] = useState<Date | null>(null);
    const [dateTo, setDateTo] = useState<Date | null>(null);
    const [rawPreviewLines, setRawPreviewLines] = useState<string[]>([]);
    const [previews, setPreviews] = useState<ImportPreviewRow[]>([]);
    const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [result, setResult] = useState<BulkImportResult | null>(null);
    const [savePresetName, setSavePresetName] = useState("");
    const [presetId, setPresetId] = useState("");
    const [sourceLabel, setSourceLabel] = useState("");
    // Whose card this is. Defaults to you: a statement is usually one person's, not the
    // whole book's — which is what an empty list used to mean.
    const [owners, setOwners] = useState<SplitDraft[]>([]);

    const { user } = useAuth();
    const isMobile = useMediaQuery("(max-width:600px)");

    // Which file selection the auto-guessed column mapping was last built for, so toggling
    // "first row is a header" afterward reparses without clobbering a mapping the user has
    // already adjusted by hand.
    const guessedForRef = useRef<File[] | null>(null);
    // Whether the majority-month default has already been applied to dateFrom/dateTo for
    // this file selection, so later mapping tweaks don't clobber a range picked by hand.
    const dateDefaultAppliedRef = useRef(false);

    useEffect(() => {
        if (!open) return;
        setOwners(user?.id ? [{ key: user.id, value: "" }] : []);
    }, [open, user?.id]);

    useEffect(() => {
        if (open) return;
        setStep(0);
        setFiles([]);
        setRawRows([]);
        setHeaders([]);
        setParseError(null);
        setRawPreviewLines([]);
        setConfig(blankConfig());
        setDateFrom(null);
        setDateTo(null);
        setPreviews([]);
        setDuplicates([]);
        setSelected(new Set());
        setResult(null);
        setSavePresetName("");
        setPresetId("");
        setSourceLabel("");
        guessedForRef.current = null;
        dateDefaultAppliedRef.current = false;
    }, [open]);

    // A raw peek at the file's first few lines, untouched by skip-rows — this is what lets
    // the user see the junk rows for themselves instead of guessing how many to skip.
    useEffect(() => {
        if (files.length === 0) {
            setRawPreviewLines([]);
            return;
        }
        let cancelled = false;
        files[0].text().then((text) => {
            if (cancelled) return;
            setRawPreviewLines(text.split(/\r\n|\n|\r/).slice(0, 3));
        });
        return () => { cancelled = true; };
    }, [files]);

    // Re-parses whenever the file set changes, or the skip-rows setting does — changing
    // how many rows to skip has to reread the actual file, not just reinterpret rows
    // already split the wrong way.
    useEffect(() => {
        if (files.length === 0) {
            setRawRows([]);
            setHeaders([]);
            setParseError(null);
            return;
        }
        let cancelled = false;
        parseAllFiles(files, config.has_header !== false, config.skip_rows || 0)
            .then((parsedResult) => {
                if (cancelled) return;
                if (parsedResult.error) {
                    setParseError(parsedResult.error);
                    setRawRows([]);
                    setHeaders([]);
                    return;
                }
                setParseError(null);
                setHeaders(parsedResult.headers);
                setRawRows(parsedResult.rows);

                // Guess the obvious columns, but only the first time this exact file set
                // is parsed — a later reparse (from toggling the header switch) must not
                // stomp a mapping the user has since adjusted.
                if (guessedForRef.current !== files) {
                    guessedForRef.current = files;
                    const guess = (candidates: string[]) =>
                        parsedResult.headers.find((f) => candidates.some((c) => f.toLowerCase().includes(c)));
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
                }
            })
            .catch((err) => {
                if (!cancelled) enqueueSnackbar(`Could not read that file: ${err.message}`, { variant: "error" });
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [files, config.has_header, config.skip_rows]);

    const mapped = useMemo(
        () => (rawRows.length ? applyMapping(rawRows, config) : { rows: [], errors: [] as MappingError[] }),
        [rawRows, config],
    );

    // The span of dates actually found in the file, plus whichever single calendar month
    // most of them fall in — a statement almost always is one month, with maybe a few days
    // spilling from the cycle before or after. Grouped by calendar month: each parsed date
    // is a date-only value anchored at UTC midnight, so its UTC month *is* the statement's
    // month, independent of who's looking.
    const dateStats = useMemo<DateStats | null>(() => {
        if (mapped.rows.length === 0) return null;
        const times = mapped.rows.map((r) => new Date(r.date).getTime());
        const from = new Date(times.reduce((min, t) => Math.min(min, t), times[0]));
        const to = new Date(times.reduce((max, t) => Math.max(max, t), times[0]));
        const counts = new Map<string, number>();
        for (const t of times) {
            const d = new Date(t);
            const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        let bestKey = "";
        let bestCount = -1;
        counts.forEach((count, key) => {
            if (count > bestCount) { bestCount = count; bestKey = key; }
        });
        const [year, month] = bestKey.split("-").map(Number);
        const majorityFrom = new Date(Date.UTC(year, month, 1));
        const majorityTo = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        return {
            from, to, totalCount: times.length,
            majority: {
                from: majorityFrom, to: majorityTo, count: bestCount,
                label: majorityFrom.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
            },
        };
    }, [mapped.rows]);

    // Defaults the range to the majority month exactly once per file selection, as soon as
    // the dates can actually be read — not on every mapping tweak after, so it never
    // clobbers a range the user has since picked on purpose.
    useEffect(() => { dateDefaultAppliedRef.current = false; }, [files]);
    useEffect(() => {
        if (dateDefaultAppliedRef.current || !dateStats) return;
        dateDefaultAppliedRef.current = true;
        setDateFrom(dateStats.majority.from);
        setDateTo(dateStats.majority.to);
    }, [dateStats]);

    const detectedOrder = useMemo(
        () => detectDateFormat(rawRows.map((r) => (config.column_map.date ? r[config.column_map.date] : ""))),
        [rawRows, config.column_map.date],
    );

    const canMap = !!config.column_map.date && !!config.column_map.description
        && (config.amount_mode === "signed" ? !!config.column_map.amount : !!config.column_map.debit);

    const handleFiles = (chosen: File[]) => {
        const csvOnly = chosen.filter((f) => f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv");
        if (csvOnly.length === 0) return;
        setFiles((prev) => [...prev, ...csvOnly]);
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const applyPreset = (id: string) => {
        setPresetId(id);
        const preset = book.import_presets.find((p) => p._id === id);
        if (!preset) return;
        // A saved mapping names its source ("Chase Visa"), which is a better label than
        // whatever the bank called the file.
        setSourceLabel(preset.name);
        setConfig({
            column_map: { ...preset.column_map },
            amount_mode: preset.amount_mode,
            sign_convention: preset.sign_convention,
            date_format: preset.date_format || "auto",
            has_header: preset.has_header,
            skip_rows: preset.skip_rows,
            default_categories: preset.default_categories,
        });
    };

    const selectedPreset = presetId ? book.import_presets.find((p) => p._id === presetId) : undefined;
    const presetUnchanged = !!selectedPreset && configMatchesPreset(config, selectedPreset);

    const toCandidates = (): ImportCandidate[] => mapped.rows.map((r) => ({
        type: r.type,
        amount: r.amount,
        date: r.date,
        description: r.description,
        categories: r.categories,
        currency: book.default_currency,
    }));

    // Rows outside the optional cutoff stay visible, just unticked by default — like
    // duplicates, nothing about what happened to a row is hidden.
    const outOfRangeIndices = useMemo(() => {
        if (!dateFrom && !dateTo) return new Set<number>();
        const from = dateFrom ? dateFrom.getTime() : -Infinity;
        const to = dateTo ? dateTo.getTime() : Infinity;
        return new Set(
            previews
                .filter((p) => {
                    const t = new Date(p.item.date).getTime();
                    return t < from || t > to;
                })
                .map((p) => p.index),
        );
    }, [previews, dateFrom, dateTo]);

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
            // Everything a rule would keep is ticked, except likely duplicates and rows
            // outside the date cutoff — those start unticked so nothing is double-counted
            // or pulled in from outside the month by default.
            const dupeIndices = new Set(dupes.map((d) => d.index));
            const from = dateFrom ? dateFrom.getTime() : -Infinity;
            const to = dateTo ? dateTo.getTime() : Infinity;
            setSelected(new Set(
                preview.previews
                    .filter((p) => {
                        if (p.skipped || dupeIndices.has(p.index)) return false;
                        const t = new Date(p.item.date).getTime();
                        return t >= from && t <= to;
                    })
                    .map((p) => p.index),
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
            const filename = files.map((f) => f.name).join(", ") || undefined;
            const imported = await importAsync({
                items: chosen,
                default_people: owners.map((o) => o.key),
                source_label: sourceLabel.trim() || undefined,
                filename,
            });
            setResult(imported);
            setStep(3);

            const presetInput = {
                name: selectedPreset ? selectedPreset.name : savePresetName.trim(),
                column_map: config.column_map,
                amount_mode: config.amount_mode,
                sign_convention: config.sign_convention,
                date_format: config.date_format,
                has_header: config.has_header,
                skip_rows: config.skip_rows,
                default_categories: config.default_categories,
            };
            if (selectedPreset && !presetUnchanged) {
                await updatePresetAsync({ presetId: selectedPreset._id, input: presetInput })
                    .catch(() => enqueueSnackbar("Imported, but the mapping could not be updated", { variant: "warning" }));
            } else if (!selectedPreset && savePresetName.trim()) {
                await savePresetAsync(presetInput)
                    .catch(() => enqueueSnackbar("Imported, but the mapping could not be saved", { variant: "warning" }));
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
        <Dialog
            open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobile}
            slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 2 } } }}
        >
            <DialogTitle>Import a CSV</DialogTitle>
            <DialogContent>
                <Stepper activeStep={step} orientation={isMobile ? "vertical" : "horizontal"} sx={{ mb: 3 }}>
                    {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                </Stepper>

                {step === 0 && (
                    <Stack spacing={2} alignItems="stretch">
                        <Typography variant="body2" color="text.secondary">
                            Export from your bank or card as CSV. The file is read here in your browser —
                            only the rows you approve are sent. Add more than one if the month is split
                            across statements.
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

                        <Box
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                handleFiles(Array.from(e.dataTransfer.files));
                            }}
                            sx={{
                                border: "2px dashed",
                                borderColor: isDragging ? "primary.main" : "divider",
                                borderRadius: 2,
                                p: 3,
                                textAlign: "center",
                                bgcolor: isDragging ? "action.hover" : "transparent",
                                transition: "background-color 0.15s, border-color 0.15s",
                            }}
                        >
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Drop CSV files here, or
                            </Typography>
                            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                                Choose CSV
                                <input
                                    type="file" hidden multiple accept=".csv,text/csv"
                                    onChange={(e) => {
                                        handleFiles(Array.from(e.target.files || []));
                                        e.target.value = "";
                                    }}
                                />
                            </Button>
                        </Box>

                        {files.length > 0 && (
                            <Stack spacing={1}>
                                {files.map((f, i) => (
                                    <Stack
                                        key={`${f.name}-${i}`} direction="row" alignItems="center" spacing={1.5}
                                        sx={{ ...cardSx, p: 1, pl: 1.5, bgcolor: "background.paper" }}
                                    >
                                        <InsertDriveFileIcon fontSize="small" color="action" />
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Typography variant="body2" noWrap>{f.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatFileSize(f.size)}
                                            </Typography>
                                        </Box>
                                        <IconButton size="small" onClick={() => removeFile(i)}>
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                ))}
                            </Stack>
                        )}

                        {parseError && <Alert severity="error">{parseError}</Alert>}
                    </Stack>
                )}

                {step === 1 && (
                    <MapStep
                        headers={headers}
                        config={config}
                        onChange={setConfig}
                        detectedOrder={detectedOrder}
                        rows={rawRows}
                        rawPreviewLines={rawPreviewLines}
                        errorCount={mapped.errors.length}
                        mappedCount={mapped.rows.length}
                        dateStats={dateStats}
                        dateFrom={dateFrom}
                        onDateFromChange={setDateFrom}
                        dateTo={dateTo}
                        onDateToChange={setDateTo}
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
                            categoryRegistry={book.categories}
                            flagRegistry={book.flags}
                            currency={book.default_currency}
                            selected={selected}
                            outOfRangeIndices={outOfRangeIndices}
                            fileLabel={files.map((f) => f.name).join(", ")}
                            onToggle={(index) => setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index); else next.add(index);
                                return next;
                            })}
                        />

                        <Box sx={{ ...cardSx, p: 2 }}>
                            <Stack spacing={2}>
                                <TextField
                                    size="small" label="Card name" value={sourceLabel}
                                    onChange={(e) => setSourceLabel(e.target.value)}
                                    placeholder="Chase Visa"
                                    helperText="Shown in the import history, so a bad file can be found and removed later."
                                />
                                {(selectedPreset ? !presetUnchanged : true) && (
                                    <Box>
                                        <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                                            Mapping
                                        </Typography>
                                        {selectedPreset ? (
                                            <Alert severity="info" variant="outlined">
                                                This mapping has changed since &ldquo;{selectedPreset.name}&rdquo; was saved.
                                                Importing will update it.
                                            </Alert>
                                        ) : (
                                            <Stack spacing={1.5}>
                                                <FormControlLabel
                                                    sx={{ m: 0 }}
                                                    control={
                                                        <Checkbox
                                                            size="small" checked={savePresetName !== ""}
                                                            onChange={(e) => setSavePresetName(
                                                                e.target.checked ? files[0]?.name.replace(/\.csv$/i, "") || "" : "",
                                                            )}
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
                                        )}
                                    </Box>
                                )}
                            </Stack>
                        </Box>

                        <Box sx={{ ...cardSx, p: 2 }}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>
                                Whose spending is this?
                            </Typography>
                            <WeightedSplitEditor
                                mode={{ kind: "people", members: book.members }}
                                splitType="equal"
                                onSplitTypeChange={() => { /* an import is always an even split */ }}
                                selected={owners}
                                onSelectedChange={setOwners}
                                amount={0}
                                currency={book.default_currency}
                                amountless
                            />
                        </Box>
                    </Stack>
                ))}

                {step === 3 && result && (
                    <Stack spacing={2}>
                        <Alert severity="success">
                            Imported {result.created} item{result.created === 1 ? "" : "s"}
                            {files.length > 0 && ` from ${files.map((f) => f.name).join(", ")}`}.
                        </Alert>
                        {result.excluded > 0 && (
                            <Typography variant="body2" color="text.secondary">
                                {result.excluded} were excluded from totals by a rule — they&rsquo;re still
                                listed, greyed out, on the items tab.
                            </Typography>
                        )}
                        {result.uncategorised > 0 && (
                            <Typography variant="body2" color="text.secondary">
                                {result.uncategorised} couldn&rsquo;t be categorised and were flagged
                                &ldquo;Uncategorised&rdquo;. Filter by that on the items tab to work
                                through them.
                            </Typography>
                        )}
                        {result.duplicates > 0 && (
                            <Typography variant="body2" color="text.secondary">
                                {result.duplicates} matched something already in this book and were
                                flagged &ldquo;Possible duplicate&rdquo;.
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
                {step === 0 && (
                    <Button
                        variant="contained"
                        disabled={files.length === 0 || headers.length === 0 || !!parseError}
                        onClick={() => setStep(1)}
                    >
                        Next
                    </Button>
                )}
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
