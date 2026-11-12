import type { ReactNode } from "react";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LinkIcon from "@mui/icons-material/Link";
import IosShareIcon from "@mui/icons-material/IosShare";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { XenDriveFile, XenDriveFolder } from "../../../../types/XenDriveFile";
import { formatFileSize } from "../../../../utils/fileUtils";
import { expiryLabel, itemCountLabel } from "../lib/driveFormat";
import FileTypeIcon from "./FileTypeIcon";

export type ActionTarget = { kind: "file"; file: XenDriveFile } | { kind: "folder"; folder: XenDriveFolder };

export interface ItemActionHandlers {
  onOpen: (target: ActionTarget) => void;
  onCopyLink: (file: XenDriveFile) => void;
  onShare: (target: ActionTarget) => void;
  onDownload: (file: XenDriveFile) => void;
  onRename: (target: ActionTarget) => void;
  onDelete: (target: ActionTarget) => void;
}

interface ItemActionsProps {
  target: ActionTarget | null;
  /** Where the desktop menu opens from. */
  anchorEl: HTMLElement | null;
  onClose: () => void;
  handlers: ItemActionHandlers;
}

interface Entry {
  key: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  danger?: boolean;
  run: () => void;
}

function entriesFor(target: ActionTarget, h: ItemActionHandlers): Entry[] {
  if (target.kind === "folder") {
    const { folder } = target;
    return [
      { key: "open", label: "Open", icon: <FolderOpenOutlinedIcon />, run: () => h.onOpen(target) },
      {
        key: "share",
        label: "Share…",
        hint: folder.shared ? "Link on" : "Link off",
        icon: <IosShareIcon />,
        run: () => h.onShare(target),
      },
      { key: "rename", label: "Rename", icon: <DriveFileRenameOutlineIcon />, run: () => h.onRename(target) },
      { key: "delete", label: "Delete", icon: <DeleteOutlineIcon />, danger: true, run: () => h.onDelete(target) },
    ];
  }
  const { file } = target;
  return [
    { key: "open", label: "Open", icon: <OpenInNewIcon />, run: () => h.onOpen(target) },
    {
      key: "copy",
      label: file.shared ? "Copy link" : "Copy link (turns the link on)",
      icon: <LinkIcon />,
      run: () => h.onCopyLink(file),
    },
    { key: "share", label: "Share…", hint: "Password, expiry", icon: <IosShareIcon />, run: () => h.onShare(target) },
    { key: "download", label: "Download", icon: <FileDownloadOutlinedIcon />, run: () => h.onDownload(file) },
    { key: "rename", label: "Rename", icon: <DriveFileRenameOutlineIcon />, run: () => h.onRename(target) },
    { key: "delete", label: "Delete", icon: <DeleteOutlineIcon />, danger: true, run: () => h.onDelete(target) },
  ];
}

/**
 * What you can do with a file or folder. A popup menu on a computer; on a phone, a sheet that slides
 * up from the bottom with the item at the top and bigger rows to tap.
 */
export default function ItemActions({ target, anchorEl, onClose, handlers }: ItemActionsProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const entries = target ? entriesFor(target, handlers) : [];
  const run = (entry: Entry) => {
    onClose();
    entry.run();
  };

  const name = target ? (target.kind === "file" ? target.file.name : target.folder.name) : "";
  const detail = !target
    ? ""
    : target.kind === "folder"
      ? itemCountLabel(target.folder.itemCount)
      : [
          formatFileSize(target.file.size),
          target.file.shared ? "Link on" : null,
          target.file.expiry ? expiryLabel(target.file.expiry) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (phone) {
    return (
      <Drawer
        anchor="bottom"
        open={!!target}
        onClose={onClose}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, pb: 2 } } }}
      >
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: "divider", mx: "auto", mt: 1.25, mb: 0.5 }} />
        {target && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 2.5,
              py: 1.5,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <FileTypeIcon
              mimeType={target.kind === "folder" ? "folder" : target.file.mimeType}
              shared={target.kind === "folder" && target.folder.shared}
              size={44}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 500 }}>
                {name}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {detail}
              </Typography>
            </Box>
          </Box>
        )}
        <List disablePadding sx={{ pt: 0.5 }}>
          {entries.map((e) => (
            <ListItemButton
              key={e.key}
              onClick={() => run(e)}
              sx={{ minHeight: 52, px: 2.5, color: e.danger ? "error.main" : undefined }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: e.danger ? "error.main" : undefined }}>{e.icon}</ListItemIcon>
              <ListItemText primary={e.label} slotProps={{ primary: { sx: { fontSize: 16 } } }} />
              {e.hint && (
                <Typography variant="body2" color="text.secondary">
                  {e.hint}
                </Typography>
              )}
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    );
  }

  return (
    <Menu anchorEl={anchorEl} open={!!target && !!anchorEl} onClose={onClose}>
      {entries.map((e) => (
        <MenuItem key={e.key} onClick={() => run(e)} sx={{ minWidth: 230, color: e.danger ? "error.main" : undefined }}>
          <ListItemIcon sx={{ color: e.danger ? "error.main" : undefined }}>{e.icon}</ListItemIcon>
          <ListItemText>{e.label}</ListItemText>
          {e.hint && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              {e.hint}
            </Typography>
          )}
        </MenuItem>
      ))}
    </Menu>
  );
}
