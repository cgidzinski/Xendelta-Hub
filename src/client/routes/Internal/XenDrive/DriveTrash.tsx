import { Box, Button, Card, Stack, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { formatDistanceToNowStrict } from "date-fns";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useXendriveTrash, useXendriveTrashActions } from "../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../utils/fileUtils";
import type { TrashedXenDriveFile } from "../../../types/XenDriveFile";

/** Files you deleted, kept for 30 days: put one back, delete it for good, or empty the lot. */
export default function DriveTrash() {
  useTitle("XenDrive - Trash");
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { data: files, isLoading, isError, error, refetch } = useXendriveTrash();
  const { restore, deleteForever, empty } = useXendriveTrashActions();

  const run = async (p: Promise<unknown>, ok: string, fail: string) => {
    try {
      await p;
      enqueueSnackbar(ok, { variant: "success" });
    } catch (e) {
      enqueueSnackbar((e as Error).message || fail, { variant: "error" });
    }
  };

  const removeForever = async (f: TrashedXenDriveFile) => {
    const ok = await confirm({
      title: "Delete this file for good?",
      message: `"${f.name}" is removed now and can't be brought back.`,
      confirmLabel: "Delete for good",
    });
    if (ok) await run(deleteForever.mutateAsync(f._id), "File deleted for good", "Couldn't delete the file");
  };

  const emptyTrash = async () => {
    const count = files?.length ?? 0;
    const ok = await confirm({
      title: "Empty the Trash?",
      message: `${count} ${count === 1 ? "file is" : "files are"} removed now and can't be brought back.`,
      confirmLabel: "Empty Trash",
    });
    if (ok) await run(empty.mutateAsync(), "Trash emptied", "Couldn't empty the Trash");
  };

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, pt: { xs: 1.5, md: 3 }, pb: 12, maxWidth: 900 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500, flex: 1 }}>
          Trash
        </Typography>
        {!!files?.length && (
          <Button color="error" onClick={emptyTrash} disabled={empty.isPending}>
            Empty Trash
          </Button>
        )}
      </Stack>

      {isLoading ? (
        <ListSkeleton rows={3} height={72} gap={1.5} />
      ) : isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load the Trash" onRetry={() => refetch()} />
      ) : !files || files.length === 0 ? (
        <EmptyState
          icon={<DeleteOutlineIcon />}
          title="Trash is empty"
          description="Files you delete are kept here for 30 days, so you can bring them back."
        />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Files are removed for good 30 days after you delete them. Until then they still count toward your storage.
          </Typography>
          <Stack spacing={1.25}>
            {files.map((f) => (
              <Card key={f._id} variant="outlined" sx={{ p: 1.5 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                  {f.name}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 180 }}>
                    {formatFileSize(f.size)} · deleted{" "}
                    {formatDistanceToNowStrict(new Date(f.deleted_at), { addSuffix: true })} · gone for good{" "}
                    {formatDistanceToNowStrict(new Date(f.purge_at), { addSuffix: true })}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => run(restore.mutateAsync(f._id), "File restored", "Couldn't restore the file")}
                    disabled={restore.isPending}
                  >
                    Restore
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => removeForever(f)}
                    disabled={deleteForever.isPending}
                  >
                    Delete for good
                  </Button>
                </Stack>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
