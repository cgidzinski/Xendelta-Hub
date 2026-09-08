import { useMemo, useState } from "react";
import {
    Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    Divider, IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import { useSnackbar } from "notistack";
import type { XenBudgetBook, XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { useXenBudgetLabels, type LabelKind } from "../../../../hooks/xenbudget/useLabels";
import LabelChip, { resolveLabelColor } from "./LabelChip";
import LabelColorPicker from "./LabelColorPicker";
import { emptyStateSx } from "../../../../components/ui/surfaceStyles";

interface LabelManagerProps {
    book: XenBudgetBook;
    kind: LabelKind;
    /** How many items currently carry each label, keyed by name. Categories only today —
     *  when present, a count shows beside the chip and deleting a label that's in use asks
     *  for confirmation first instead of stripping it from those items silently. */
    itemCounts?: Record<string, number>;
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
export default function LabelManager({ book, kind, itemCounts }: LabelManagerProps) {
    const { enqueueSnackbar } = useSnackbar();
    const { createLabelAsync, isCreating, updateLabelAsync, deleteLabelAsync, isDeleting } =
        useXenBudgetLabels(book._id, kind);
    // Shown A→Z rather than in creation order — a long registry is otherwise a hunt for the
    // one you want. Sorted on render; `resolveLabelColor` / `LabelChip` take this array as a
    // name-keyed registry, so order doesn't matter to them.
    const labels = useMemo(
        () => [...(book[kind] || [])].sort(
            (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
        [book, kind],
    );
    const copy = COPY[kind];

    const [draft, setDraft] = useState("");
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; count: number } | null>(null);

    const run = async (fn: () => Promise<unknown>, fallback: string) => {
        try {
            await fn();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : fallback, { variant: "error" });
        }
    };

    // A label with items on it deletes silently otherwise — asked for confirmation instead
    // of stripping it from every one of them without warning. One with nothing on it (or a
    // kind with no counts at all, i.e. flags) keeps today's instant delete.
    const handleDeleteClick = (label: { _id: string; name: string }) => {
        const count = itemCounts?.[label.name] ?? 0;
        if (count > 0) setConfirmDelete({ id: label._id, name: label.name, count });
        else run(() => deleteLabelAsync(label._id), "Could not delete that");
    };

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return;
        await run(() => deleteLabelAsync(confirmDelete.id), "Could not delete that");
        setConfirmDelete(null);
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

    const setNeedWant = async (label: { _id: string }, needWant: "need" | "want" | "none") => {
        await run(
            () => updateLabelAsync({ labelId: label._id, input: { need_want: needWant } }),
            "Could not set that",
        );
    };

    // The pieces categories and flags share, so neither row layout below repeats them.
    const renderRenameField = (label: XenBudgetLabel) => (
        <TextField
            size="small" autoFocus value={editing?.name ?? ""}
            onChange={(e) => setEditing(editing ? { ...editing, name: e.target.value } : null)}
            onBlur={async () => {
                const name = (editing?.name ?? "").trim();
                if (name && name !== label.name) {
                    await run(() => updateLabelAsync({ labelId: label._id, input: { name } }),
                        "Could not rename that");
                }
                setEditing(null);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            sx={{ flexGrow: 1, minWidth: 0 }}
        />
    );

    const renderColor = (label: XenBudgetLabel) => (
        kind === "categories" || !label.system ? (
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
        )
    );

    const renderRowControls = (label: XenBudgetLabel) => (
        label.system ? (
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
                    <IconButton size="small" onClick={() => handleDeleteClick(label)}>
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </>
        )
    );

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

            <Divider sx={{ mb: 1.5 }} />

            {labels.length === 0 ? (
                <Box sx={{ ...emptyStateSx, py: 3 }}>
                    <Typography variant="body2" color="text.secondary">{copy.empty}</Typography>
                </Box>
            ) : (
                <Stack spacing={kind === "categories" ? 0 : 0.25}>
                    {labels.map((label, i) => {
                        const editingThis = editing?.id === label._id;

                        // Flags: one line at every width — chip · colour · actions. A long
                        // custom name ellipsizes rather than pushing the row to wrap.
                        if (kind !== "categories") {
                            return (
                                <Box
                                    key={label._id}
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0,1fr) auto auto",
                                        alignItems: "center",
                                        columnGap: 1,
                                        px: 1, py: 0.5, borderRadius: 1,
                                        "&:hover": { bgcolor: "action.hover" },
                                    }}
                                >
                                    {editingThis ? renderRenameField(label) : (
                                        <Box sx={{ minWidth: 0, display: "flex" }}>
                                            <LabelChip
                                                name={label.name} registry={labels} variant2={copy.chip}
                                                sx={{ maxWidth: "100%" }}
                                            />
                                        </Box>
                                    )}
                                    {renderColor(label)}
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                                        {renderRowControls(label)}
                                    </Box>
                                </Box>
                            );
                        }

                        // Categories: a dual-row block at every width. Line A is identity +
                        // colour + edit/delete; Line B is the full-width Want/Need/— band.
                        return (
                            <Box
                                key={label._id}
                                sx={{
                                    display: "flex", flexDirection: "column", gap: 1,
                                    px: 1, py: 1, borderRadius: 1,
                                    "&:hover": { bgcolor: "action.hover" },
                                    ...(i > 0 ? { borderTop: 1, borderColor: "divider" } : {}),
                                }}
                            >
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    {editingThis ? renderRenameField(label) : (
                                        <Box sx={{
                                            flexGrow: 1, minWidth: 0,
                                            display: "flex", alignItems: "center", gap: 1,
                                        }}>
                                            <Box sx={{ display: "flex", minWidth: 0 }}>
                                                <LabelChip
                                                    name={label.name} registry={labels} variant2={copy.chip}
                                                    sx={{ maxWidth: "100%" }}
                                                />
                                            </Box>
                                            {itemCounts && (
                                                <Chip
                                                    size="small" variant="outlined"
                                                    label={itemCounts[label.name] ?? 0}
                                                    sx={{ height: 20, fontSize: 11, flexShrink: 0 }}
                                                />
                                            )}
                                        </Box>
                                    )}
                                    <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 0.25 }}>
                                        {renderColor(label)}
                                        {renderRowControls(label)}
                                    </Box>
                                </Box>

                                <ToggleButtonGroup
                                    size="small" exclusive fullWidth value={label.need_want ?? "none"}
                                    onChange={(_, v) => { if (v) setNeedWant(label, v as "need" | "want" | "none"); }}
                                    sx={{
                                        "& .MuiToggleButton-root": {
                                            flex: 1, py: 0.75, fontSize: 12, textTransform: "none",
                                        },
                                    }}
                                >
                                    <ToggleButton value="want">Want</ToggleButton>
                                    <ToggleButton value="need">Need</ToggleButton>
                                    <ToggleButton value="none">—</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                        );
                    })}
                </Stack>
            )}

            <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
                <DialogTitle>Delete &ldquo;{confirmDelete?.name}&rdquo;?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This removes it from {confirmDelete?.count} item{confirmDelete?.count === 1 ? "" : "s"} —
                        they keep everything else, they just lose this {copy.chip}. This cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
                    <Button color="error" disabled={isDeleting} onClick={handleConfirmDelete}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
