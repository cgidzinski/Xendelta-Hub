import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useRestoreXenNoteVersion, useXenNoteVersion, useXenNoteVersions } from "../../../../hooks/xennote/useXenNote";
import type { XenNoteVersionFull } from "../../../../types/XenNote";
import NoteMarkdown from "./NoteMarkdown";

interface NoteHistoryDialogProps {
  open: boolean;
  noteId: string | null;
  /** Whether the person can put a version back (viewers can only look). */
  canRestore: boolean;
  onClose: () => void;
  /** Called after a version was put back, so the editor can show the note as it is now. */
  onRestored: () => void;
}

/** What a version says, as the card would show it. */
function VersionBody({ v }: { v: XenNoteVersionFull }) {
  return (
    <Box>
      {v.title && <Typography sx={{ fontWeight: 600, mb: 1, wordBreak: "break-word" }}>{v.title}</Typography>}
      {v.type === "checklist" ? (
        v.checklist.length === 0 ? (
          <Typography color="text.secondary">An empty list.</Typography>
        ) : (
          v.checklist.map((c, i) => (
            <Typography
              key={i}
              variant="body2"
              sx={{ textDecoration: c.done ? "line-through" : "none", color: c.done ? "text.disabled" : undefined }}
            >
              {c.done ? "☑" : "☐"} {c.text}
            </Typography>
          ))
        )
      ) : v.type === "link" ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {v.link.title || v.link.url}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
            {v.link.url}
          </Typography>
          {v.link.description && <Typography variant="body2">{v.link.description}</Typography>}
        </Box>
      ) : v.body ? (
        <NoteMarkdown text={v.body} />
      ) : (
        <Typography color="text.secondary">Nothing written.</Typography>
      )}
    </Box>
  );
}

/** A note's earlier versions: pick one to read it, and put it back if it is the one you want. */
export default function NoteHistoryDialog({ open, noteId, canRestore, onClose, onRestored }: NoteHistoryDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { data: versions, isLoading, isError } = useXenNoteVersions(open ? (noteId ?? undefined) : undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const restore = useRestoreXenNoteVersion();
  const { data: full, isLoading: loadingFull } = useXenNoteVersion(noteId ?? undefined, selected ?? undefined);

  // Open on the newest version.
  useEffect(() => {
    if (open && versions && versions.length > 0)
      setSelected((s) => (s && versions.some((v) => v._id === s) ? s : versions[0]._id));
    if (!open) setSelected(null);
  }, [open, versions]);

  const putBack = async () => {
    if (!noteId || !selected || !full) return;
    const ok = await confirm({
      title: "Put this version back?",
      message: "The note goes back to how it was then. What it says now is kept in the history, so you can undo this.",
      confirmLabel: "Put it back",
      destructive: false,
    });
    if (!ok) return;
    try {
      await restore.mutateAsync({ noteId, versionId: selected });
      enqueueSnackbar("Version put back", { variant: "success" });
      onRestored();
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't put it back", { variant: "error" });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title="History"
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          {canRestore && (
            <Button variant="contained" onClick={putBack} disabled={!full || restore.isPending}>
              Put this version back
            </Button>
          )}
        </>
      }
    >
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert severity="error">Couldn't load the history.</Alert>
      ) : !versions || versions.length === 0 ? (
        <Typography color="text.secondary">
          No earlier versions yet. When the wording of this note changes, how it was is kept here (the last 20).
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 2, minHeight: 280 }}>
          <List
            dense
            aria-label="Versions"
            sx={{
              width: { sm: 240 },
              flexShrink: 0,
              maxHeight: { xs: 160, sm: 420 },
              overflowY: "auto",
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            {versions.map((v) => (
              <ListItemButton key={v._id} selected={v._id === selected} onClick={() => setSelected(v._id)}>
                <ListItemText
                  primary={format(new Date(v.at), "MMM d, h:mm a")}
                  secondary={`${v.by_name ?? "Someone"} · ${formatDistanceToNowStrict(new Date(v.at), { addSuffix: true })}`}
                />
              </ListItemButton>
            ))}
          </List>
          <Box sx={{ flex: 1, minWidth: 0, p: 1, maxHeight: 420, overflowY: "auto" }}>
            {loadingFull || !full ? <CircularProgress size={24} /> : <VersionBody v={full} />}
          </Box>
        </Box>
      )}
    </ResponsiveDialog>
  );
}
