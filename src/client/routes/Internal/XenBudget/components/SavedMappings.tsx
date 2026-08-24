import { useState } from "react";
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
    Stack, TextField, Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import { useOutletContext } from "react-router-dom";
import type { BookDetailContext } from "../BookDetail";
import { useXenBudgetImport } from "../../../../hooks/xenbudget/useImport";
import type { PresetInput, XenBudgetImportPreset } from "../../../../hooks/xenbudget/types";
import type { MappingConfig } from "../../../../utils/csvMapping";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import MapStep from "./ImportWizard/MapStep";

/** A working copy of a preset while it is being edited. */
interface EditDraft {
    _id: string;
    name: string;
    config: MappingConfig;
    headers: string[];
}

export default function SavedMappings() {
    const { book } = useOutletContext<BookDetailContext>();
    const { updatePresetAsync, deletePresetAsync } = useXenBudgetImport(book._id);
    const { enqueueSnackbar } = useSnackbar();
    const [editing, setEditing] = useState<EditDraft | null>(null);
    const [deleting, setDeleting] = useState<XenBudgetImportPreset | null>(null);

    const startEdit = (p: XenBudgetImportPreset) => {
        const config: MappingConfig = {
            column_map: { ...p.column_map },
            sign_convention: p.sign_convention ?? "negative_is_expense",
            date_format: p.date_format || "auto",
            has_header: p.has_header,
            skip_rows: p.skip_rows,
            default_categories: p.default_categories,
        };
        // Without the original file only the mapped headers are known, so the same
        // mapping dropdowns are shown without sample rows or a raw preview.
        const headers = [...new Set([
            p.column_map.date, p.column_map.description, p.column_map.amount,
            p.column_map.debit, p.column_map.credit, p.column_map.categories,
            p.column_map.memo,
        ].filter((h): h is string => !!h))];
        setEditing({ _id: p._id, name: p.name, config, headers });
    };

    const saveEdit = async () => {
        if (!editing) return;
        const name = editing.name.trim();
        if (!name) return;
        const input: PresetInput = {
            name,
            column_map: { ...editing.config.column_map },
            sign_convention: editing.config.sign_convention,
            date_format: editing.config.date_format,
            has_header: editing.config.has_header,
            skip_rows: editing.config.skip_rows,
            default_categories: editing.config.default_categories,
        };
        try {
            await updatePresetAsync({ presetId: editing._id, input });
            enqueueSnackbar("Mapping updated", { variant: "success" });
            setEditing(null);
        } catch {
            enqueueSnackbar("Could not update mapping", { variant: "error" });
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deletePresetAsync(deleting._id);
            enqueueSnackbar("Mapping deleted", { variant: "success" });
            setDeleting(null);
        } catch {
            enqueueSnackbar("Could not delete mapping", { variant: "error" });
        }
    };

    if (book.import_presets.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                No saved mappings yet. They appear when you import a CSV.
            </Typography>
        );
    }

    return (
        <Stack spacing={0.75}>
            {book.import_presets.map((p) => (
                <Stack
                    key={p._id} direction="row" alignItems="center" spacing={1}
                    sx={{ ...cardSx, px: 1.25, py: 1 }}
                >
                    <Typography variant="body2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                        {p.name}
                    </Typography>
                    <IconButton size="small" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}>
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}>
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>
            ))}

            <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="md">
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Edit mapping
                    <IconButton size="small" onClick={() => setEditing(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {editing && (
                        <Stack spacing={2} sx={{ pt: 1 }}>
                            <TextField
                                autoFocus fullWidth size="small" label="Name" value={editing.name}
                                onChange={(e) => setEditing((d) => (d ? { ...d, name: e.target.value } : d))}
                                sx={{ mt: 2 }}
                            />
                            <MapStep
                                headers={editing.headers}
                                config={editing.config}
                                onChange={(c) => setEditing((d) => (d ? { ...d, config: c } : d))}
                                detectedOrder="ymd"
                                showDateRange={false}
                                showRowNav={false}
                                rows={[]}
                                rawPreviewLines={[]}
                                errorCount={0}
                                mappedCount={0}
                                customRangeCount={0}
                                dateStats={null}
                                dateFrom={null}
                                onDateFromChange={() => { }}
                                dateTo={null}
                                onDateToChange={() => { }}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button variant="contained" disabled={!editing?.name.trim()} onClick={saveEdit}>Save</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
                <DialogTitle>Delete this mapping?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary">
                        Deleting &ldquo;{deleting?.name}&rdquo; won&rsquo;t remove its past imports —
                        they&rsquo;ll show as &ldquo;Import&rdquo; in history.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleting(null)}>Cancel</Button>
                    <Button color="error" onClick={confirmDelete}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

