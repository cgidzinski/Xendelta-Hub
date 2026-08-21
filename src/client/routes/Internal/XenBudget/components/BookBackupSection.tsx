import { useState } from "react";
import {
    Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText,
    DialogTitle, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import type { XenBudgetBook } from "../../../../hooks/xenbudget/types";
import { useXenBudgetBackup } from "../../../../hooks/xenbudget/useBackup";

interface BookBackupSectionProps {
    book: XenBudgetBook;
    isCreator: boolean;
}

/**
 * Per-book backup. Distinct from the report page's CSV export, which is for analysis and
 * is lossy: this JSON round-trips tags, budgets, rules, presets, shares and exclusions.
 */
export default function BookBackupSection({ book, isCreator }: BookBackupSectionProps) {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const {
        exportBook, restoreHereAsync, isRestoringHere, restoreAsNewAsync, isRestoringAsNew,
    } = useXenBudgetBackup(book._id);

    const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
    const [fileName, setFileName] = useState("");
    const [target, setTarget] = useState<"new" | "merge" | "replace">("new");

    const readFile = async (file: File) => {
        try {
            const parsed = JSON.parse(await file.text());
            if (parsed?.format_version !== 1 || !parsed?.book?.name) {
                enqueueSnackbar("That doesn't look like a XenBudget backup", { variant: "error" });
                return;
            }
            setPayload(parsed);
            setFileName(file.name);
            setTarget("new");
        } catch {
            enqueueSnackbar("That file isn't readable JSON", { variant: "error" });
        }
    };

    const itemCount = Array.isArray(payload?.items) ? (payload.items as unknown[]).length : 0;

    const doRestore = async () => {
        if (!payload) return;
        try {
            const result = target === "new"
                ? await restoreAsNewAsync(payload)
                : await restoreHereAsync({ payload, mode: target });
            const unmatched = result.unmatched_people?.length
                ? ` ${result.unmatched_people.length} person(s) couldn't be matched to an account here.`
                : "";
            enqueueSnackbar(`Restored ${result.restored} item(s).${unmatched}`, { variant: "success" });
            setPayload(null);
            if (target === "new" && result.book?._id) {
                navigate(`/internal/xenbudget/books/${result.book._id}/overview`);
            }
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Restore failed", { variant: "error" });
        }
    };

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                A full backup of this book — items, tags, budgets, rules and saved import
                mappings — as one JSON file.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                <Button
                    size="small" variant="outlined" startIcon={<DownloadIcon />}
                    onClick={() => exportBook(book.name).catch(() =>
                        enqueueSnackbar("Export failed", { variant: "error" }))}
                >
                    Download backup
                </Button>
                <Button size="small" variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                    Restore from file
                    <input
                        type="file" hidden accept="application/json,.json"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }}
                    />
                </Button>
            </Stack>

            <Dialog open={!!payload} onClose={() => setPayload(null)} fullWidth maxWidth="xs">
                <DialogTitle>Restore backup</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <DialogContentText>
                            <strong>{String((payload?.book as { name?: string })?.name ?? "")}</strong> — {itemCount} item
                            {itemCount === 1 ? "" : "s"} from {fileName}.
                        </DialogContentText>
                        <TextField
                            select fullWidth size="small" label="Restore to"
                            value={target} onChange={(e) => setTarget(e.target.value as typeof target)}
                        >
                            <MenuItem value="new">A new book</MenuItem>
                            <MenuItem value="merge">This book — add what&rsquo;s missing</MenuItem>
                            {isCreator && <MenuItem value="replace">This book — replace everything</MenuItem>}
                        </TextField>
                        {target === "merge" && (
                            <Alert severity="info">
                                Items this book already has are skipped, so restoring over live data
                                won&rsquo;t double anything.
                            </Alert>
                        )}
                        {target === "replace" && (
                            <Alert severity="warning">
                                Every item, tag, budget and rule currently in &ldquo;{book.name}&rdquo; is
                                deleted and replaced by the backup. This cannot be undone.
                            </Alert>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPayload(null)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color={target === "replace" ? "error" : "primary"}
                        disabled={isRestoringHere || isRestoringAsNew}
                        onClick={doRestore}
                    >
                        Restore
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
