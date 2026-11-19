import { Box, Button, Card, Stack, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { formatDistanceToNowStrict } from "date-fns";
import { useSnackbar } from "notistack";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useXenNoteTrash, useXenNoteTrashActions } from "../../../../hooks/xennote/useXenNote";
import type { TrashedXenNote } from "../../../../types/XenNote";

/** The notes you deleted, kept for 30 days: put one back, delete it for good, or empty the lot. */
export default function NoteTrash() {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { data: notes, isLoading, isError, error, refetch } = useXenNoteTrash();
  const { restore, deleteForever, empty } = useXenNoteTrashActions();

  const run = async (p: Promise<unknown>, ok: string, fail: string) => {
    try {
      await p;
      enqueueSnackbar(ok, { variant: "success" });
    } catch (e) {
      enqueueSnackbar((e as Error).message || fail, { variant: "error" });
    }
  };

  const removeForever = async (n: TrashedXenNote) => {
    const ok = await confirm({
      title: "Delete this note for good?",
      message: "It and its photos are removed now and can't be brought back.",
      confirmLabel: "Delete for good",
    });
    if (ok) await run(deleteForever.mutateAsync(n._id), "Note deleted for good", "Couldn't delete the note");
  };

  const emptyTrash = async () => {
    const ok = await confirm({
      title: "Empty the Trash?",
      message: `${notes?.length ?? 0} ${notes?.length === 1 ? "note is" : "notes are"} removed now, with their photos, and can't be brought back.`,
      confirmLabel: "Empty Trash",
    });
    if (ok) await run(empty.mutateAsync(), "Trash emptied", "Couldn't empty the Trash");
  };

  if (isLoading) return <ListSkeleton rows={3} height={80} gap={1.5} />;
  if (isError) return <ErrorDisplay error={error ?? null} title="Couldn't load the Trash" onRetry={() => refetch()} />;
  if (!notes || notes.length === 0) {
    return (
      <EmptyState
        icon={<DeleteOutlineIcon />}
        title="Trash is empty"
        description="Notes you delete are kept here for 30 days, so you can bring them back."
      />
    );
  }

  return (
    <Box sx={{ maxWidth: 640, mx: "auto" }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Notes are removed for good 30 days after you delete them.
        </Typography>
        <Button size="small" color="error" onClick={emptyTrash} disabled={empty.isPending}>
          Empty Trash
        </Button>
      </Stack>
      <Stack spacing={1.25}>
        {notes.map((n) => (
          <Card key={n._id} variant="outlined" sx={{ p: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }} noWrap>
              {n.title || n.preview || "Untitled"}
            </Typography>
            {n.title && n.preview && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {n.preview}
              </Typography>
            )}
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                Deleted {formatDistanceToNowStrict(new Date(n.deleted_at), { addSuffix: true })} · gone for good{" "}
                {formatDistanceToNowStrict(new Date(n.purge_at), { addSuffix: true })}
              </Typography>
              <Button
                size="small"
                onClick={() => run(restore.mutateAsync(n._id), "Note restored", "Couldn't restore the note")}
                disabled={restore.isPending}
              >
                Restore
              </Button>
              <Button size="small" color="error" onClick={() => removeForever(n)} disabled={deleteForever.isPending}>
                Delete for good
              </Button>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
