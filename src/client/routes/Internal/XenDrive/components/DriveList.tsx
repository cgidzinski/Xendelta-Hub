import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardActionArea,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import FolderSharedIcon from "@mui/icons-material/FolderShared";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditIcon from "@mui/icons-material/Edit";
import ShareIcon from "@mui/icons-material/Share";
import DeleteIcon from "@mui/icons-material/Delete";
import LockIcon from "@mui/icons-material/Lock";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { format, formatDistanceToNow } from "date-fns";
import { useSnackbar } from "notistack";
import type { XenDriveFile, XenDriveFolder } from "../../../../types/XenDriveFile";
import { formatFileSize } from "../../../../utils/fileUtils";
import { fileShareUrl } from "../../../../hooks/xendrive/useXendrive";
import { filePath } from "../paths";

interface DriveListProps {
  folders: XenDriveFolder[];
  files: XenDriveFile[];
  folderTo: (folderId: string) => string;
  onRename: (folder: XenDriveFolder) => void;
  onShare: (folder: XenDriveFolder) => void;
  onDelete: (folder: XenDriveFolder) => void;
}

const typeLabel = (mime: string) => {
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("zip") || mime.includes("archive")) return "Archive";
  if (mime.includes("text")) return "Text";
  return "File";
};

const expiryText = (file: XenDriveFile) => {
  if (!file.expiry) return "No expiry";
  const when = new Date(file.expiry);
  return when <= new Date() ? "Expired" : `Expires in ${formatDistanceToNow(when)}`;
};

/** Folders first, then files. A folder opens on click; its menu renames, shares or deletes it. */
export default function DriveList({ folders, files, folderTo, onRename, onShare, onDelete }: DriveListProps) {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; folder: XenDriveFolder } | null>(null);

  const copyFileLink = (e: React.MouseEvent, file: XenDriveFile) => {
    e.stopPropagation();
    if (!file.shareToken) return;
    navigator.clipboard.writeText(fileShareUrl(file.shareToken));
    enqueueSnackbar("Link copied", { variant: "success" });
  };

  const run = (fn: (f: XenDriveFolder) => void) => {
    if (menu) fn(menu.folder);
    setMenu(null);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {folders.map((folder) => (
        <Card key={folder._id} variant="outlined">
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <CardActionArea onClick={() => navigate(folderTo(folder._id))} sx={{ flex: 1, p: 1.5, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                {folder.shared ? <FolderSharedIcon color="primary" /> : <FolderIcon color="primary" />}
                <Typography noWrap sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}>
                  {folder.name}
                </Typography>
                {folder.shared && <Chip size="small" label="Shared" variant="outlined" />}
              </Box>
            </CardActionArea>
            <IconButton
              aria-label={`Actions for ${folder.name}`}
              onClick={(e) => setMenu({ anchor: e.currentTarget, folder })}
              sx={{ mx: 0.5 }}
            >
              <MoreVertIcon />
            </IconButton>
          </Box>
        </Card>
      ))}

      {files.map((file) => (
        <Card key={file._id} variant="outlined">
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <CardActionArea onClick={() => navigate(filePath(file._id))} sx={{ flex: 1, p: 1.5, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
                <InsertDriveFileOutlinedIcon color="action" sx={{ mt: 0.25 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 500, wordBreak: "break-word" }}>{file.name}</Typography>
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {typeLabel(file.mimeType)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatFileSize(file.size)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {format(new Date(file.createdAt), "MMM d, yyyy")}
                    </Typography>
                  </Box>
                  {(file.hasPassword || file.expiry) && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                      {file.hasPassword && (
                        <Chip
                          icon={<LockIcon sx={{ fontSize: 14 }} />}
                          label="Password"
                          size="small"
                          variant="outlined"
                          color="success"
                        />
                      )}
                      {file.expiry && (
                        <Chip
                          icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
                          label={expiryText(file)}
                          size="small"
                          variant="outlined"
                          color={new Date(file.expiry) <= new Date() ? "error" : "info"}
                        />
                      )}
                    </Stack>
                  )}
                </Box>
              </Box>
            </CardActionArea>
            {file.shareToken && (
              <IconButton
                aria-label={`Copy link to ${file.name}`}
                onClick={(e) => copyFileLink(e, file)}
                sx={{ mx: 0.5 }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Card>
      ))}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => run(onRename)}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onShare)}>
          <ListItemIcon>
            <ShareIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Share</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => run(onDelete)} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
