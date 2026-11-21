import { Box, Button, Stack, Typography } from "@mui/material";
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
import { DriveHeader, DriveHeading } from "./components/DriveHeader";
import FileTypeIcon from "./components/FileTypeIcon";

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
    <>
      <DriveHeader>
        <DriveHeading title="Trash" icon={<DeleteOutlineIcon fontSize="small" />} />
        {!!files?.length && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={emptyTrash}
            disabled={empty.isPending}
          >
            Empty Trash
          </Button>
        )}
      </DriveHeader>

      {isLoading ? (
        <ListSkeleton rows={6} height={56} gap={1} />
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
          <Box
            component="ul"
            aria-label="Deleted files"
            sx={{
              m: 0,
              p: 0,
              listStyle: "none",
              border: 1,
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            {files.map((f) => (
              <Box
                key={f._id}
                component="li"
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) auto" },
                  alignItems: "center",
                  gap: 1,
                  minHeight: 56,
                  px: 1.5,
                  py: 0.5,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:last-child": { borderBottom: 0 },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                  <FileTypeIcon mimeType={f.mimeType} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500 }} noWrap>
                      {f.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {formatFileSize(f.size)} · deleted{" "}
                      {formatDistanceToNowStrict(new Date(f.deleted_at), { addSuffix: true })} · gone for good{" "}
                      {formatDistanceToNowStrict(new Date(f.purge_at), { addSuffix: true })}
                    </Typography>
                  </Box>
                </Box>
                <Stack direction="row" justifyContent="flex-end" spacing={1} flexWrap="wrap" useFlexGap>
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
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
}
