import { useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Button, InputAdornment, LinearProgress, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { useSnackbar } from "notistack";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTitle } from "../../../hooks/useTitle";
import { api } from "../../../config/api";
import { useXendriveActions, useXendriveBrowse } from "../../../hooks/xendrive/useXendrive";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { formatFileSize } from "../../../utils/fileUtils";
import type { FolderStats, XenDriveFolder } from "../../../types/XenDriveFile";
import DriveBreadcrumbs from "./components/DriveBreadcrumbs";
import DriveList from "./components/DriveList";
import FolderDialog from "./components/FolderDialog";
import FolderShareDialog from "./components/FolderShareDialog";
import UploadDialog from "./components/UploadDialog";
import { XENDRIVE_ROOT, folderPath } from "./paths";

export default function XenDrive() {
  useTitle("XenDrive");
  const { folderId } = useParams<{ folderId?: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { profile } = useUserProfile();
  const { createFolder, renameFolder, deleteFolder } = useXendriveActions();

  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renaming, setRenaming] = useState<XenDriveFolder | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useXendriveBrowse(folderId ?? null, search.trim() || undefined);
  const sharing = data?.folders.find((f) => f._id === sharingId) ?? null;

  const removeFolder = async (folder: XenDriveFolder) => {
    let detail = "Everything inside it is deleted too.";
    try {
      const stats = await api.get<FolderStats>(`/api/xendrive/folders/${folder._id}/stats`);
      if (stats.files + stats.folders > 0) {
        const parts = [
          stats.files ? `${stats.files} ${stats.files === 1 ? "file" : "files"} (${formatFileSize(stats.size)})` : "",
          stats.folders ? `${stats.folders} ${stats.folders === 1 ? "folder" : "folders"}` : "",
        ].filter(Boolean);
        detail = `It holds ${parts.join(" and ")}, which are deleted too.`;
      } else {
        detail = "It is empty.";
      }
    } catch {
      /* fall back to the generic wording */
    }
    const ok = await confirm({
      title: `Delete "${folder.name}"?`,
      message: `${detail} This can't be undone.`,
      confirmLabel: "Delete folder",
    });
    if (!ok) return;
    deleteFolder.mutate(folder._id, {
      onSuccess: () => enqueueSnackbar("Folder deleted", { variant: "success" }),
      onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't delete the folder", { variant: "error" }),
    });
  };

  const usage = profile?.xendrive;
  const quotaPercentage = usage && usage.spaceAllowed > 0 ? (usage.spaceUsed / usage.spaceAllowed) * 100 : 0;
  const empty = !!data && data.folders.length === 0 && data.files.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="XenDrive"
        actions={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              startIcon={<CreateNewFolderOutlinedIcon />}
              onClick={() => setNewFolderOpen(true)}
            >
              New folder
            </Button>
            <Button variant="contained" startIcon={<CloudUploadIcon />} onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
          </Box>
        }
      />

      {usage && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Storage: {formatFileSize(usage.spaceUsed)} / {formatFileSize(usage.spaceAllowed)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {usage.fileCount} {usage.fileCount === 1 ? "file" : "files"}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, quotaPercentage)}
            color={quotaPercentage > 90 ? "error" : quotaPercentage > 75 ? "warning" : "primary"}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>
      )}

      <TextField
        fullWidth
        placeholder="Search all files..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2 }}
      />

      {data?.searching ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Search results in all folders
        </Typography>
      ) : (
        <DriveBreadcrumbs crumbs={data?.breadcrumb ?? []} folderTo={folderPath} rootTo={XENDRIVE_ROOT} />
      )}

      {isLoading && !data ? (
        <ListSkeleton rows={5} height={64} gap={1.5} />
      ) : isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load this folder" onRetry={() => refetch()} />
      ) : empty ? (
        <EmptyState
          icon={<FolderOpenIcon />}
          title={data?.searching ? "No files match" : folderId ? "This folder is empty" : "No files yet"}
          description={data?.searching ? "Try a different name." : "Upload files or make a folder to get started."}
        />
      ) : (
        <DriveList
          folders={data?.folders ?? []}
          files={data?.files ?? []}
          folderTo={folderPath}
          onRename={setRenaming}
          onShare={(f) => setSharingId(f._id)}
          onDelete={removeFolder}
        />
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} folderId={folderId ?? null} />

      <FolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onSave={async (name) => {
          const { folder } = await createFolder.mutateAsync({ name, parentId: folderId ?? null });
          enqueueSnackbar(`Folder "${folder.name}" created`, { variant: "success" });
        }}
      />
      <FolderDialog
        open={!!renaming}
        onClose={() => setRenaming(null)}
        initialName={renaming?.name ?? ""}
        onSave={async (name) => {
          await renameFolder.mutateAsync({ folderId: renaming!._id, name });
        }}
      />
      <FolderShareDialog folder={sharing} onClose={() => setSharingId(null)} />
    </PageContainer>
  );
}
