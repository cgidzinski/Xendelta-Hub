import { Box, Checkbox, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import LinkIcon from "@mui/icons-material/Link";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import type { XenDriveFile, XenDriveFolder } from "../../../../types/XenDriveFile";
import { formatFileSize } from "../../../../utils/fileUtils";
import { formatModified, itemCountLabel } from "../lib/driveFormat";
import { fileKindOf } from "../lib/fileKind";
import { useFolderDrop } from "../lib/useFileDrop";
import FileTypeIcon from "./FileTypeIcon";
import LinkChips from "./LinkChips";
import SourceChips from "./SourceChips";
import type { DriveListHandlers } from "./DriveTable";

interface DriveGridProps {
  folders: XenDriveFolder[];
  files: XenDriveFile[];
  handlers: DriveListHandlers;
  onCopyLink: (file: XenDriveFile) => void;
  onDownload: (file: XenDriveFile) => void;
}

const gridSx = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 2 } as const;

// Touch screens have no hover, so the checkbox and quick actions are always there; with a mouse they appear on hover.
const reveal = {
  opacity: 0,
  transition: "opacity .12s",
  "@media (hover: none)": { opacity: 1 },
} as const;

function FolderCard({ folder, h }: { folder: XenDriveFolder; h: DriveListHandlers }) {
  const drop = useFolderDrop((files) => h.onDropFiles(folder._id, files));
  const selected = h.selected.has(folder._id);
  return (
    <Box
      {...drop.props}
      onClick={() => h.onOpenFolder(folder)}
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          height: 56,
          pl: 1.75,
          pr: 0.5,
          border: 1,
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "background.paper",
          cursor: "pointer",
          "&:hover": { borderColor: "text.disabled" },
        },
        selected && { borderColor: "primary.main", bgcolor: (t) => alpha(t.palette.primary.main, 0.1) },
        drop.over && {
          borderColor: "primary.main",
          borderStyle: "dashed",
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
        },
      ]}
    >
      <FileTypeIcon mimeType="folder" shared={folder.shared} size={32} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 500 }}>
          {folder.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {itemCountLabel(folder.itemCount)}
        </Typography>
      </Box>
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

function FileCard({
  file,
  h,
  onCopyLink,
  onDownload,
}: { file: XenDriveFile; h: DriveListHandlers } & Pick<DriveGridProps, "onCopyLink" | "onDownload">) {
  const selected = h.selected.has(file._id);
  const kind = fileKindOf(file.mimeType);
  return (
    <Box
      onClick={() => h.onOpenFile(file)}
      sx={[
        {
          border: 1,
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "background.paper",
          overflow: "hidden",
          cursor: "pointer",
          position: "relative",
          "&:hover": { borderColor: "text.disabled" },
          "&:hover .reveal, &:focus-within .reveal": { opacity: 1 },
        },
        selected && { borderColor: "primary.main" },
      ]}
    >
      <Box
        sx={{
          height: 136,
          position: "relative",
          bgcolor: "action.hover",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {kind === "image" && file.previewUrl ? (
          <Box
            component="img"
            src={file.previewUrl}
            alt=""
            loading="lazy"
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <FileTypeIcon mimeType={file.mimeType} size={64} />
        )}

        <Checkbox
          className="reveal"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => h.onToggle(file._id)}
          slotProps={{ input: { "aria-label": `Select ${file.name}` } }}
          sx={[
            { position: "absolute", top: 4, left: 4, bgcolor: "background.paper", borderRadius: 1.5, p: 0.5 },
            selected ? { opacity: 1 } : reveal,
          ]}
        />

        <Box className="reveal" sx={[{ position: "absolute", top: 6, right: 6, display: "flex", gap: 0.5 }, reveal]}>
          {!file.source && (
            <Tooltip title={file.shared ? "Copy link" : "Copy link (turns it on)"}>
              <IconButton
                size="small"
                aria-label={`Copy link to ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyLink(file);
                }}
                sx={{ bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
              >
                <LinkIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Download">
            <IconButton
              size="small"
              aria-label={`Download ${file.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDownload(file);
              }}
              sx={{ bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
            >
              <FileDownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ position: "absolute", left: 8, bottom: 8, right: 8 }}>
          <LinkChips file={file} />
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 1.5,
          py: 1.25,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <FileTypeIcon mimeType={file.mimeType} size={28} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 500 }}>
            {file.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {formatFileSize(file.size)} · {formatModified(file.createdAt)}
          </Typography>
          {file.source && (
            <Box sx={{ mt: 0.5 }}>
              <SourceChips file={file} />
            </Box>
          )}
        </Box>
        <IconButton
          size="small"
          aria-label={`Actions for ${file.name}`}
          onClick={(e) => {
            e.stopPropagation();
            h.onMenu({ kind: "file", file }, e.currentTarget);
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

/** The grid view: folders as small cards, then files as cards with a picture (or a big icon) on top. */
export default function DriveGrid({ folders, files, handlers, onCopyLink, onDownload }: DriveGridProps) {
  return (
    <Box>
      {folders.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: "block", mb: 1 }}>
            Folders
          </Typography>
          <Box sx={{ ...gridSx, mb: files.length ? 3.5 : 0 }}>
            {folders.map((f) => (
              <FolderCard key={f._id} folder={f} h={handlers} />
            ))}
          </Box>
        </>
      )}
      {files.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: "block", mb: 1 }}>
            Files
          </Typography>
          <Box sx={gridSx}>
            {files.map((f) => (
              <FileCard key={f._id} file={f} h={handlers} onCopyLink={onCopyLink} onDownload={onDownload} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
