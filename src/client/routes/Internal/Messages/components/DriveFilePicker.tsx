import { useState } from "react";
import { Box, Button, Checkbox, InputAdornment, TextField, Typography } from "@mui/material";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import EmptyState from "../../../../components/ui/EmptyState";
import { useXendriveBrowse } from "../../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../../utils/fileUtils";
import type { XenDriveFile } from "../../../../types/XenDriveFile";
import FileTypeIcon from "../../XenDrive/components/FileTypeIcon";

interface DriveFilePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (files: XenDriveFile[]) => void;
  /** Files already attached, so they aren't offered twice. */
  excludeIds: string[];
}

/** Choose files from your XenDrive to attach. They are attached as they are: nothing is copied, no storage is used. */
export default function DriveFilePicker({ open, onClose, onPick, excludeIds }: DriveFilePickerProps) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<XenDriveFile[]>([]);
  const q = search.trim();
  const { data, isLoading } = useXendriveBrowse(folderId, q || undefined);

  const close = () => {
    setPicked([]);
    setFolderId(null);
    setSearch("");
    onClose();
  };
  const toggle = (file: XenDriveFile) =>
    setPicked((current) =>
      current.some((f) => f._id === file._id) ? current.filter((f) => f._id !== file._id) : [...current, file],
    );

  const files = (data?.files ?? []).filter((f) => !excludeIds.includes(f._id));
  const folders = data?.folders ?? [];

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      title="Choose from XenDrive"
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="contained"
            disabled={picked.length === 0}
            onClick={() => {
              onPick(picked);
              close();
            }}
          >
            {picked.length > 0 ? `Attach ${picked.length}` : "Attach"}
          </Button>
        </>
      }
    >
      <TextField
        size="small"
        fullWidth
        placeholder="Search your files"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          htmlInput: { "aria-label": "Search your files" },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 1.5 }}
      />

      {!q && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
          <Button size="small" onClick={() => setFolderId(null)} disabled={!folderId}>
            My Drive
          </Button>
          {(data?.breadcrumb ?? []).map((crumb) => (
            <Button
              key={crumb._id}
              size="small"
              onClick={() => setFolderId(crumb._id)}
              disabled={crumb._id === folderId}
            >
              / {crumb.name}
            </Button>
          ))}
        </Box>
      )}

      {isLoading && !data ? (
        <ListSkeleton rows={5} height={48} gap={1} />
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyState title={q ? "No files match" : "No files here"} sx={{ py: 3 }} />
      ) : (
        <Box sx={{ maxHeight: 360, overflowY: "auto" }}>
          {!q &&
            folders.map((folder) => (
              <Box
                key={folder._id}
                component="button"
                type="button"
                onClick={() => setFolderId(folder._id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  width: "100%",
                  px: 1,
                  py: 1,
                  border: 0,
                  background: "none",
                  font: "inherit",
                  color: "text.primary",
                  textAlign: "left",
                  cursor: "pointer",
                  borderRadius: 1,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <FolderOutlinedIcon color="action" />
                <Typography noWrap sx={{ flex: 1 }}>
                  {folder.name}
                </Typography>
              </Box>
            ))}
          {files.map((file) => (
            <Box
              component="label"
              key={file._id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1,
                py: 0.75,
                borderRadius: 1,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Checkbox
                size="small"
                checked={picked.some((f) => f._id === file._id)}
                onChange={() => toggle(file)}
                slotProps={{ input: { "aria-label": `Select ${file.name}` } }}
              />
              <FileTypeIcon mimeType={file.mimeType} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap>{file.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatFileSize(file.size)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </ResponsiveDialog>
  );
}
