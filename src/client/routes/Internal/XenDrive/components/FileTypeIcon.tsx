import { Box } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import FolderSharedIcon from "@mui/icons-material/FolderShared";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { KIND_COLOR, fileKindOf, type FileKind } from "../lib/fileKind";

const ICON: Record<FileKind, typeof ImageOutlinedIcon> = {
  image: ImageOutlinedIcon,
  pdf: PictureAsPdfOutlinedIcon,
  archive: FolderZipOutlinedIcon,
  text: DescriptionOutlinedIcon,
  video: VideocamOutlinedIcon,
  audio: AudiotrackOutlinedIcon,
  file: InsertDriveFileOutlinedIcon,
};

interface FileTypeIconProps {
  /** A file's mime type, or "folder". */
  mimeType: string | "folder";
  /** A shared folder shows the shared-folder icon. */
  shared?: boolean;
  size?: number;
  sx?: SxProps<Theme>;
}

/** The tinted square that tells you what something is at a glance: blue folders, teal images, red PDFs... */
export default function FileTypeIcon({ mimeType, shared, size = 36, sx }: FileTypeIconProps) {
  const isFolder = mimeType === "folder";
  const kind = isFolder ? null : fileKindOf(mimeType);
  const colorKey = isFolder ? "primary" : KIND_COLOR[kind!];
  const Icon = isFolder ? (shared ? FolderSharedIcon : FolderIcon) : ICON[kind!];

  return (
    <Box
      aria-hidden
      sx={[
        (theme) => {
          const main = colorKey === "inherit" ? theme.palette.text.secondary : theme.palette[colorKey].main;
          return {
            width: size,
            height: size,
            borderRadius: `${Math.round(size / 4.5)}px`,
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: main,
            backgroundColor: alpha(main, 0.16),
          };
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Icon sx={{ fontSize: Math.round(size * 0.56) }} />
    </Box>
  );
}
