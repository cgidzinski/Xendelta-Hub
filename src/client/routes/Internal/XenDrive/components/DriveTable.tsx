import { Box, Checkbox, Chip, IconButton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import type { XenDriveFile, XenDriveFolder } from "../../../../types/XenDriveFile";
import { formatFileSize } from "../../../../utils/fileUtils";
import { formatModified, itemCountLabel } from "../lib/driveFormat";
import { KIND_LABEL, fileKindOf } from "../lib/fileKind";
import { useFolderDrop } from "../lib/useFileDrop";
import type { ActionTarget } from "./ItemActions";
import FileTypeIcon from "./FileTypeIcon";
import LinkChips from "./LinkChips";

/** What the list and the grid both need from the page: opening, the menu, selecting, and drops. */
export interface DriveListHandlers {
  onOpenFolder: (folder: XenDriveFolder) => void;
  onOpenFile: (file: XenDriveFile) => void;
  onMenu: (target: ActionTarget, anchor: HTMLElement) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onDropFiles: (folderId: string, files: File[]) => void;
}

// checkbox | name | modified | size | link | actions. The middle columns drop away on a phone.
const COLUMNS = {
  xs: "minmax(0,1fr) 44px",
  md: "44px minmax(0,1fr) 140px 96px 220px 44px",
};

const rowSx = {
  display: "grid",
  gridTemplateColumns: COLUMNS,
  alignItems: "center",
  columnGap: 1,
  minHeight: 56,
  px: { xs: 1.5, md: 1.5 },
  borderBottom: 1,
  borderColor: "divider",
  "&:last-of-type": { borderBottom: 0 },
} as const;

const hideOnPhone = { display: { xs: "none", md: "block" } } as const;

function FolderRow({ folder, h }: { folder: XenDriveFolder; h: DriveListHandlers }) {
  const drop = useFolderDrop((files) => h.onDropFiles(folder._id, files));
  const selected = h.selected.has(folder._id);
  return (
    <Box
      {...drop.props}
      onClick={() => h.onOpenFolder(folder)}
      sx={[
        rowSx,
        { cursor: "pointer", "&:hover": { bgcolor: "action.hover" } },
        selected && { bgcolor: (t) => alpha(t.palette.primary.main, 0.12) },
        drop.over && {
          outline: 2,
          outlineStyle: "solid",
          outlineColor: "primary.main",
          outlineOffset: -2,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
        },
      ]}
    >
      <Checkbox
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => h.onToggle(folder._id)}
        slotProps={{ input: { "aria-label": `Select ${folder.name}` } }}
        sx={{ display: { xs: "none", md: "inline-flex" }, gridColumn: { md: 1 } }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, gridColumn: { md: 2 } }}>
        <FileTypeIcon mimeType="folder" shared={folder.shared} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 500 }}>
            {folder.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { md: "none" } }}>
            {itemCountLabel(folder.itemCount)}
          </Typography>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={hideOnPhone}>
        {formatModified(folder.created_at)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ ...hideOnPhone, textAlign: "right" }}>
        {itemCountLabel(folder.itemCount)}
      </Typography>
      <Box sx={hideOnPhone}>
        {folder.shared && (
          <Chip
            size="small"
            variant="outlined"
            color="primary"
            icon={<LinkIcon sx={{ fontSize: 14 }} />}
            label="Link on"
          />
        )}
      </Box>
      <IconButton
        aria-label={`Actions for ${folder.name}`}
        onClick={(e) => {
          e.stopPropagation();
          h.onMenu({ kind: "folder", folder }, e.currentTarget);
        }}
        sx={{ gridColumn: { xs: 2, md: 6 } }}
      >
        <MoreVertIcon />
      </IconButton>
    </Box>
  );
}

function FileRow({ file, h }: { file: XenDriveFile; h: DriveListHandlers }) {
  const selected = h.selected.has(file._id);
  return (
    <Box
      onClick={() => h.onOpenFile(file)}
      sx={[
        rowSx,
        { cursor: "pointer", "&:hover": { bgcolor: "action.hover" } },
        selected && { bgcolor: (t) => alpha(t.palette.primary.main, 0.12) },
      ]}
    >
      <Checkbox
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => h.onToggle(file._id)}
        slotProps={{ input: { "aria-label": `Select ${file.name}` } }}
        sx={{ display: { xs: "none", md: "inline-flex" }, gridColumn: { md: 1 } }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, gridColumn: { md: 2 } }}>
        <FileTypeIcon mimeType={file.mimeType} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 500 }}>
            {file.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            <Box component="span" sx={{ display: { md: "none" } }}>
              {formatModified(file.createdAt)} · {formatFileSize(file.size)} ·{" "}
            </Box>
            {KIND_LABEL[fileKindOf(file.mimeType)]}
          </Typography>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={hideOnPhone}>
        {formatModified(file.createdAt)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ ...hideOnPhone, textAlign: "right" }}>
        {formatFileSize(file.size)}
      </Typography>
      <Box sx={hideOnPhone}>
        <LinkChips file={file} />
      </Box>
      <IconButton
        aria-label={`Actions for ${file.name}`}
        onClick={(e) => {
          e.stopPropagation();
          h.onMenu({ kind: "file", file }, e.currentTarget);
        }}
        sx={{ gridColumn: { xs: 2, md: 6 } }}
      >
        <MoreVertIcon />
      </IconButton>
    </Box>
  );
}

interface DriveTableProps {
  folders: XenDriveFolder[];
  files: XenDriveFile[];
  handlers: DriveListHandlers;
}

/** The list view: folders first, then files, one row each, with a select-all header. */
export default function DriveTable({ folders, files, handlers }: DriveTableProps) {
  const total = folders.length + files.length;
  const all = total > 0 && handlers.selected.size === total;
  return (
    <Box
      component="section"
      aria-label="Files and folders"
      sx={{ border: 1, borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: "background.paper" }}
    >
      <Box sx={[rowSx, { minHeight: 42, bgcolor: "action.hover", display: { xs: "none", md: "grid" } }]}>
        <Checkbox
          checked={all}
          indeterminate={handlers.selected.size > 0 && !all}
          onChange={handlers.onToggleAll}
          slotProps={{ input: { "aria-label": "Select all" } }}
        />
        {["Name", "Modified", "Size", "Link", ""].map((label, i) => (
          <Typography
            key={label || i}
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.4, textAlign: i === 2 ? "right" : "left" }}
          >
            {label}
          </Typography>
        ))}
      </Box>
      {folders.map((f) => (
        <FolderRow key={f._id} folder={f} h={handlers} />
      ))}
      {files.map((f) => (
        <FileRow key={f._id} file={f} h={handlers} />
      ))}
    </Box>
  );
}
