import { createContext, useContext } from "react";
import { Box, Link as MuiLink, Typography } from "@mui/material";
import BrokenImageOutlinedIcon from "@mui/icons-material/BrokenImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import LinkIcon from "@mui/icons-material/Link";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { isSafeUrl } from "@shared/xennote/notes";
import { Bookmark, FileBlock, ImageBlock } from "@shared/xennote/pageSchema";
import type { PageFileInfo } from "../../../../types/XenNotePage";

/** What the blocks that show a stored file need: where the files are, and what to do when a picture is opened. */
export interface PageFilesValue {
  files: Record<string, PageFileInfo>;
  onOpenImage: (url: string) => void;
}
export const PageFilesContext = createContext<PageFilesValue>({ files: {}, onOpenImage: () => undefined });

/** "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const cardSx = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  p: 1.5,
  my: 1,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  bgcolor: "background.paper",
} as const;

function ImageBlockView({ node, selected }: NodeViewProps) {
  const { files, onOpenImage } = useContext(PageFilesContext);
  const info = node.attrs.file_id ? files[node.attrs.file_id as string] : undefined;
  return (
    <NodeViewWrapper data-drag-handle contentEditable={false}>
      {info?.url ? (
        <Box
          component="img"
          src={info.url}
          alt={String(node.attrs.alt ?? "")}
          onClick={() => onOpenImage(info.url as string)}
          sx={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 520,
            borderRadius: 2,
            my: 1,
            cursor: "zoom-in",
            outline: selected ? 2 : 0,
            outlineStyle: "solid",
            outlineColor: "primary.main",
          }}
        />
      ) : (
        <Box sx={{ ...cardSx, color: "text.secondary" }}>
          <BrokenImageOutlinedIcon />
          <Typography variant="body2">This picture isn't available any more</Typography>
        </Box>
      )}
    </NodeViewWrapper>
  );
}

function FileBlockView({ node, selected }: NodeViewProps) {
  const { files } = useContext(PageFilesContext);
  const info = node.attrs.file_id ? files[node.attrs.file_id as string] : undefined;
  const name = info?.name || String(node.attrs.name || "File");
  const isPdf = (info?.mime ?? node.attrs.mime) === "application/pdf";
  return (
    <NodeViewWrapper data-drag-handle contentEditable={false}>
      <Box sx={{ ...cardSx, ...(selected ? { borderColor: "primary.main" } : {}) }}>
        {isPdf ? <PictureAsPdfOutlinedIcon color="error" /> : <InsertDriveFileOutlinedIcon color="action" />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 500 }}>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {info ? formatBytes(info.size) : "This file isn't available any more"}
          </Typography>
        </Box>
        {info?.url && (
          <MuiLink href={info.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontWeight: 500 }}>
            {isPdf ? "Preview" : "Open"}
          </MuiLink>
        )}
      </Box>
    </NodeViewWrapper>
  );
}

function BookmarkView({ node, selected }: NodeViewProps) {
  const url = String(node.attrs.url ?? "");
  const safe = isSafeUrl(url);
  const title = String(node.attrs.title ?? "") || url;
  const description = String(node.attrs.description ?? "");
  return (
    <NodeViewWrapper data-drag-handle contentEditable={false}>
      <Box sx={{ ...cardSx, ...(selected ? { borderColor: "primary.main" } : {}) }}>
        <LinkIcon color="action" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {safe ? (
            <MuiLink
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              noWrap
              sx={{ fontWeight: 500, display: "block" }}
            >
              {title}
            </MuiLink>
          ) : (
            <Typography noWrap sx={{ fontWeight: 500 }}>
              {title}
            </Typography>
          )}
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
      </Box>
    </NodeViewWrapper>
  );
}

/** The shared page nodes, drawn with React: pictures, files and link cards need the files the page refers to. */
export const ImageBlockWithView = ImageBlock.extend({ addNodeView: () => ReactNodeViewRenderer(ImageBlockView) });
export const FileBlockWithView = FileBlock.extend({ addNodeView: () => ReactNodeViewRenderer(FileBlockView) });
export const BookmarkWithView = Bookmark.extend({ addNodeView: () => ReactNodeViewRenderer(BookmarkView) });
