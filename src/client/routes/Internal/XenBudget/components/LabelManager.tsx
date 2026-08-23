import { useState } from "react";
import {
    Box, Button, IconButton, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import { useSnackbar } from "notistack";
import type { XenBudgetBook } from "../../../../hooks/xenbudget/types";
import { useXenBudgetLabels, type LabelKind } from "../../../../hooks/xenbudget/useLabels";
import LabelChip, { resolveLabelColor } from "./LabelChip";
import LabelColorPicker from "./LabelColorPicker";
import { emptyStateSx } from "../../../../components/ui/surfaceStyles";

interface LabelManagerProps {
    book: XenBudgetBook;
    kind: LabelKind;
}

const COPY = {
    categories: {
        placeholder: "New category",
        empty: "No categories yet. A category you type on an item works straight away — add it here to pick its colour or rename it everywhere at once.",
        chip: "category" as const,
    },
    flags: {
        placeholder: "New flag",
        empty: "No flags yet. Flags mark things needing attention.",
        chip: "flag" as const,
    },
};

/**
 * Add, rename, recolour and remove one of a book's two label registries.
 *
 * Rendered twice in Settings rather than written twice: categories and flags are managed
 * identically. A built-in flag shows its colour but no rename or delete, with the reason
 * stated — a disabled control nobody can explain is worse than no control.
 */
export default function LabelManager({ book, kind }: LabelManagerProps) {
    const { enqueueSnackbar } = useSnackbar();
    const { createLabelAsync, isCreating, updateLabelAsync, deleteLabelAsync } =
        useXenBudgetLabels(book._id, kind);
    const labels = book[kind] || [];
    const copy = COPY[kind];

    const [draft, setDraft] = useState("");
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

    const run = async (fn: () => Promise<unknown>, fallback: string) => {
        try {
            await fn();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : fallback, { variant: "error" });
        }
    };

    const handleAdd = async () => {
        const name = draft.trim();
        if (!name) return;
        await run(async () => {
            await createLabelAsync({ name });
            setDraft("");
        }, "Could not create that");
    };

    const setColor = async (label: { _id: string; name: string }, hex: string) => {
        await run(() => updateLabelAsync({ labelId: label._id, input: { color: hex } }), "Could not set that colour");
    };

    return (
        <Box>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <TextField
                    size="small" fullWidth placeholder={copy.placeholder} value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <Button size="small" startIcon={<AddIcon />} disabled={!draft.trim() || isCreating} onClick={handleAdd}>
                    Add
                </Button>
            </Stack>

            {labels.length === 0 ? (
                <Box sx={{ ...emptyStateSx, py: 3 }}>
                    <Typography variant="body2" color="text.secondary">{copy.empty}</Typography>
                </Box>
            ) : (
                <Stack spacing={0.75}>
                    {labels.map((label) => (
                        <Stack key={label._id} direction="row" alignItems="center" spacing={1}>
                            {editing?.id === label._id ? (
                                <TextField
                                    size="small" autoFocus value={editing.name}
                                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                    onBlur={async () => {
                                        const name = editing.name.trim();
                                        if (name && name !== label.name) {
                                            await run(() => updateLabelAsync({ labelId: label._id, input: { name } }),
                                                "Could not rename that");
                                        }
                                        setEditing(null);
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    sx={{ flexGrow: 1 }}
                                />
                            ) : (
                                <Box sx={{ flexGrow: 1 }}>
                                    <LabelChip name={label.name} registry={labels} variant2={copy.chip} />
                                </Box>
                            )}

                            {kind === "categories" || !label.system ? (
                                <LabelColorPicker
                                    color={resolveLabelColor(label.name, labels, copy.chip)}
                                    onChange={(hex) => setColor(label, hex)}
                                />
                            ) : (
                                <Box sx={{ p: 0.25 }}>
                                    <Box sx={{
                                        width: 16, height: 16, borderRadius: "50%",
                                        bgcolor: resolveLabelColor(label.name, labels, copy.chip),
                                    }} />
                                </Box>
                            )}

                            {label.system ? (
                                <Tooltip title={`Built in — rules and imports refer to this by name, so it can't be renamed or deleted.${kind === "categories" ? " Its colour is yours to change." : ""}`}>
                                    <LockIcon fontSize="small" sx={{ color: "text.disabled", mx: 0.5 }} />
                                </Tooltip>
                            ) : (
                                <>
                                    <Tooltip title="Rename everywhere">
                                        <IconButton size="small" onClick={() => setEditing({ id: label._id, name: label.name })}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete and strip from every item">
                                        <IconButton
                                            size="small"
                                            onClick={() => run(() => deleteLabelAsync(label._id), "Could not delete that")}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            )}
                        </Stack>
                    ))}
                </Stack>
            )}
        </Box>
    );
}
