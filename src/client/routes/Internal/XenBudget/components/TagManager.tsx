import { useState } from "react";
import {
    Box, Button, IconButton, Popover, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useSnackbar } from "notistack";
import type { XenBudgetBook } from "../../../../hooks/xenbudget/types";
import { useXenBudgetTags } from "../../../../hooks/xenbudget/useTags";
import TagChip, { resolveTagColor } from "./TagChip";
import { CHART_COLORS } from "../../../../components/ui/chartColors";
import { emptyStateSx } from "../../../../components/ui/surfaceStyles";

interface TagManagerProps {
    book: XenBudgetBook;
}

export default function TagManager({ book }: TagManagerProps) {
    const { enqueueSnackbar } = useSnackbar();
    const {
        createTagAsync, isCreatingTag, updateTagAsync, deleteTagAsync,
    } = useXenBudgetTags(book._id);

    const [newTag, setNewTag] = useState("");
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
    const [colorAnchor, setColorAnchor] = useState<{ el: HTMLElement; tagId: string } | null>(null);

    const run = async (fn: () => Promise<unknown>, fallback: string) => {
        try {
            await fn();
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : fallback, { variant: "error" });
        }
    };

    const handleAdd = async () => {
        const name = newTag.trim();
        if (!name) return;
        await run(async () => {
            await createTagAsync({ name });
            setNewTag("");
        }, "Failed to create tag");
    };

    return (
        <Box>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <TextField
                    size="small" fullWidth placeholder="New tag" value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <Button
                    size="small" startIcon={<AddIcon />}
                    disabled={!newTag.trim() || isCreatingTag} onClick={handleAdd}
                >
                    Add
                </Button>
            </Stack>

            {book.tags.length === 0 ? (
                <Box sx={{ ...emptyStateSx, py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                        No tags yet. Tags you type on an item work straight away — add them here to
                        pick their colour or rename them everywhere at once.
                    </Typography>
                </Box>
            ) : (
                <Stack spacing={0.75}>
                    {book.tags.map((tag) => (
                        <Stack key={tag._id} direction="row" alignItems="center" spacing={1}>
                            {editing?.id === tag._id ? (
                                <TextField
                                    size="small" autoFocus value={editing.name}
                                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                    onBlur={async () => {
                                        const name = editing.name.trim();
                                        if (name && name !== tag.name) {
                                            await run(() => updateTagAsync({ tagId: tag._id, input: { name } }),
                                                "Failed to rename tag");
                                        }
                                        setEditing(null);
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    sx={{ flexGrow: 1 }}
                                />
                            ) : (
                                <Box sx={{ flexGrow: 1 }}>
                                    <TagChip tag={tag.name} registry={book.tags} />
                                </Box>
                            )}

                            <Tooltip title="Colour">
                                <IconButton
                                    size="small"
                                    onClick={(e) => setColorAnchor({ el: e.currentTarget, tagId: tag._id })}
                                >
                                    <Box sx={{
                                        width: 16, height: 16, borderRadius: "50%",
                                        bgcolor: resolveTagColor(tag.name, book.tags),
                                    }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Rename everywhere">
                                <IconButton size="small" onClick={() => setEditing({ id: tag._id, name: tag.name })}>
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete and strip from every item">
                                <IconButton
                                    size="small"
                                    onClick={() => run(() => deleteTagAsync(tag._id), "Failed to delete tag")}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    ))}
                </Stack>
            )}

            <Popover
                open={!!colorAnchor}
                anchorEl={colorAnchor?.el}
                onClose={() => setColorAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            >
                <Box sx={{ p: 1, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0.75 }}>
                    {CHART_COLORS.map((c) => (
                        <IconButton
                            key={c} size="small"
                            onClick={async () => {
                                if (colorAnchor) {
                                    await run(() => updateTagAsync({ tagId: colorAnchor.tagId, input: { color: c } }),
                                        "Failed to set colour");
                                }
                                setColorAnchor(null);
                            }}
                        >
                            <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: c }} />
                        </IconButton>
                    ))}
                </Box>
            </Popover>
        </Box>
    );
}
