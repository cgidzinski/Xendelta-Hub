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

/*
 * The list adapts to the room it has, not the screen: with the sidebar open a tablet gives it little more than a
 * phone would. The section is a size container and three tiers show more as it widens:
 *   narrow  name (with date, size and link under it) | actions
 *   medium  checkbox | name (with date and link under it) | size | actions
 *   wide    checkbox | name | modified | size | link | actions
 * Cells are told apart by class and hidden or shown per tier, so a row is always laid out by auto-placement.
 */
const MEDIUM = "@container (min-width: 600px)";
const WIDE = "@container (min-width: 900px)";

const tableSx = {
  border: 1,
  borderColor: "divider",
  borderRadius: 3,
  overflow: "hidden",
  bgcolor: "background.paper",
  containerType: "inline-size",
  "& .row": {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 44px",
    alignItems: "center",
    columnGap: 1,
    minHeight: 56,
    px: 1.5,
    py: 0.5,
    borderBottom: 1,
    borderColor: "divider",
  },
  "& .row:last-of-type": { borderBottom: 0 },
  "& .head": { display: "none", minHeight: 42, bgcolor: "action.hover" },
  "& .c-check, & .c-mod, & .c-size, & .c-link, & .s-mod, & .s-size": { display: "none" },
  "& .under": { display: "block", mt: 0.5 },
  "& .s-mod, & .s-size": { display: "inline" },
  [MEDIUM]: {
    "& .row": { gridTemplateColumns: "44px minmax(0,1fr) 96px 44px" },
    "& .head": { display: "grid" },
    "& .c-check": { display: "inline-flex" },
    "& .c-size": { display: "block", textAlign: "right" },
    "& .s-size": { display: "none" },
  },
  [WIDE]: {
    "& .row": { gridTemplateColumns: "44px minmax(0,1fr) 150px 110px 200px 44px", columnGap: 2 },
    "& .c-mod, & .c-link": { display: "block" },
    "& .c-size": { pr: 1 },
    "& .s-mod, & .under": { display: "none" },
  },
} as const;

/** What the Link column shows when nothing is shared: a quiet dash, so the column does not look broken. */
const NoLink = () => (
  <Typography variant="body2" color="text.disabled" aria-hidden>
    —
  </Typography>
);

function FolderRow({ folder, h }: { folder: XenDriveFolder; h: DriveListHandlers }) {
  const drop = useFolderDrop((files) => h.onDropFiles(folder._id, files));
  const selected = h.selected.has(folder._id);
  const linkChip = folder.shared && (
    <Chip size="small" variant="outlined" color="primary" icon={<LinkIcon sx={{ fontSize: 14 }} />} label="Link on" />
  );
  return (
    <Box
      className="row"
      {...drop.props}
      onClick={() => h.onOpenFolder(folder)}
      sx={[
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
        className="c-check"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => h.onToggle(folder._id)}
        slotProps={{ input: { "aria-label": `Select ${folder.name}` } }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <FileTypeIcon mimeType="folder" shared={folder.shared} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 500 }}>
            {folder.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            <span className="s-mod">{formatModified(folder.created_at)}</span>
            <span className="s-size"> · {itemCountLabel(folder.itemCount)}</span>
          </Typography>
          {linkChip && <Box className="under">{linkChip}</Box>}
        </Box>
      </Box>
      <Typography className="c-mod" variant="body2" color="text.secondary">
        {formatModified(folder.created_at)}
      </Typography>
      <Typography className="c-size" variant="body2" color="text.secondary">
        {itemCountLabel(folder.itemCount)}
      </Typography>
      <Box className="c-link">{linkChip || <NoLink />}</Box>
      <IconButton
        aria-label={`Actions for ${folder.name}`}
        onClick={(e) => {
          e.stopPropagation();
          h.onMenu({ kind: "folder", folder }, e.currentTarget);
        }}
      >
        <MoreVertIcon />
      </IconButton>
    </Box>
  );
}

function FileRow({ file, h }: { file: XenDriveFile; h: DriveListHandlers }) {
  const selected = h.selected.has(file._id);
  const hasLinkInfo = file.shared;
  return (
    <Box
      className="row"
      onClick={() => h.onOpenFile(file)}
      sx={[
        { cursor: "pointer", "&:hover": { bgcolor: "action.hover" } },
        selected && { bgcolor: (t) => alpha(t.palette.primary.main, 0.12) },
      ]}
    >
      <Checkbox
        className="c-check"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => h.onToggle(file._id)}
        slotProps={{ input: { "aria-label": `Select ${file.name}` } }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <FileTypeIcon mimeType={file.mimeType} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 500 }}>
            {file.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            <span className="s-mod">{formatModified(file.createdAt)}</span>
            <span className="s-size"> · {formatFileSize(file.size)}</span>
            <span className="s-mod"> · </span>
            {KIND_LABEL[fileKindOf(file.mimeType)]}
          </Typography>
          {hasLinkInfo && (
            <Box className="under">
              <LinkChips file={file} />
            </Box>
          )}
        </Box>
      </Box>
      <Typography className="c-mod" variant="body2" color="text.secondary">
        {formatModified(file.createdAt)}
      </Typography>
      <Typography className="c-size" variant="body2" color="text.secondary">
        {formatFileSize(file.size)}
      </Typography>
      <Box className="c-link">
        {file.shared || file.hasPassword || file.expiry ? <LinkChips file={file} /> : <NoLink />}
      </Box>
      <IconButton
        aria-label={`Actions for ${file.name}`}
        onClick={(e) => {
          e.stopPropagation();
          h.onMenu({ kind: "file", file }, e.currentTarget);
        }}
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

const headLabel = { textTransform: "uppercase", letterSpacing: 0.4 } as const;

/** The list view: folders first, then files, one row each, with a select-all header. */
export default function DriveTable({ folders, files, handlers }: DriveTableProps) {
  const total = folders.length + files.length;
  const all = total > 0 && handlers.selected.size === total;
  return (
    <Box component="section" aria-label="Files and folders" sx={tableSx}>
      <Box className="row head">
        <Checkbox
          className="c-check"
          checked={all}
          indeterminate={handlers.selected.size > 0 && !all}
          onChange={handlers.onToggleAll}
          slotProps={{ input: { "aria-label": "Select all" } }}
        />
        <Typography variant="caption" color="text.secondary" sx={headLabel}>
          Name
        </Typography>
        <Typography className="c-mod" variant="caption" color="text.secondary" sx={headLabel}>
          Modified
        </Typography>
        <Typography className="c-size" variant="caption" color="text.secondary" sx={headLabel}>
          Size
        </Typography>
        <Typography className="c-link" variant="caption" color="text.secondary" sx={headLabel}>
          Link
        </Typography>
        <span />
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
