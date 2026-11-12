import { Box, Button, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTitle } from "../../../hooks/useTitle";
import { downloadFile, useXendriveActions, useXendriveAppFiles } from "../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../utils/fileUtils";
import type { XenDriveFile } from "../../../types/XenDriveFile";
import FileTypeIcon from "./components/FileTypeIcon";
import SourceChips from "./components/SourceChips";

/**
 * Files that apps stored in the drive for you (chat attachments, ...). They count toward your storage but are kept out of
 * My Drive so they don't crowd it; this is where you see them and free the space.
 */
export default function AppFiles() {
  useTitle("XenDrive - From apps");
  const { data, isLoading, isError, error, refetch } = useXendriveAppFiles();
  const { deleteFile } = useXendriveActions();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();

  const removeFiles = async (files: XenDriveFile[], what: string) => {
    const ok = await confirm({
      title: files.length === 1 ? "Delete this file?" : `Delete ${files.length} files?`,
      message: `${what} will be deleted for good. Anyone it was sent to will see it as removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await Promise.all(files.map((f) => deleteFile.mutateAsync(f._id)));
      enqueueSnackbar(files.length === 1 ? "File deleted" : `${files.length} files deleted`, { variant: "success" });
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't delete", { variant: "error" });
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <PageHeader
        title="From apps"
        subtitle={
          data && data.count > 0
            ? `${data.count} ${data.count === 1 ? "file" : "files"} · ${formatFileSize(data.size)}. These count toward your storage.`
            : "Files that apps store here for you"
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} height={56} />
      ) : isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load these files" onRetry={() => refetch()} />
      ) : !data || data.count === 0 ? (
        <EmptyState
          icon={<AppsOutlinedIcon />}
          title="Nothing here"
          description="Files you send in chat are kept here, not in My Drive."
        />
      ) : (
        data.apps.map((app) => (
          <Box key={app.app} sx={{ mb: 4 }}>
            <SectionLabel>
              {app.label} · {formatFileSize(app.size)}
            </SectionLabel>
            {app.groups.map((group) => (
              <Box key={group.ref} sx={{ mb: 2.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
                  <Typography sx={{ flex: 1, fontWeight: 600 }} noWrap>
                    {group.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {group.count} {group.count === 1 ? "file" : "files"} · {formatFileSize(group.size)}
                  </Typography>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => removeFiles(group.files, `All ${group.count} files from “${group.label}”`)}
                  >
                    Delete all
                  </Button>
                </Box>
                <Divider />
                {group.files.map((file) => (
                  <Box key={file._id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
                    <FileTypeIcon mimeType={file.mimeType} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap>{file.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatFileSize(file.size)} · {format(new Date(file.createdAt), "MMM d, yyyy")}
                      </Typography>
                      <SourceChips file={file} showSource={false} />
                    </Box>
                    <Tooltip title="Download">
                      <IconButton aria-label={`Download ${file.name}`} onClick={() => downloadFile(file._id)}>
                        <FileDownloadOutlinedIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        aria-label={`Delete ${file.name}`}
                        onClick={() => removeFiles([file], `“${file.name}”`)}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}
