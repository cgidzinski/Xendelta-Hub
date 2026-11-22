import { createContext, useContext, type KeyboardEvent, type MouseEvent } from "react";
import { Box, Link as MuiLink, Typography } from "@mui/material";
import BrokenImageOutlinedIcon from "@mui/icons-material/BrokenImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import LinkIcon from "@mui/icons-material/Link";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { isSafeUrl } from "@shared/xennote/notes";
import { Bookmark, FileBlock, Hashtag, ImageBlock, WikiLink } from "@shared/xennote/pageSchema";
import { usePagePeek } from "../../../../hooks/xennote/usePages";
import type { PageFileInfo } from "../../../../types/XenNotePage";
import { PageLinksContext, PublicPageLinksContext } from "./pageLinksContext";

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

/** Enter or Space on a link made of a span acts like a click. */
const activate = (run: (e: MouseEvent | KeyboardEvent) => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    run(e);
  }
};

/**
 * A link to another page. It shows the page's current name (looked up when drawn, so a rename shows everywhere), a lock
 * when the person can't open it (with the words that were typed, which they could already read), or a dotted underline
 * when there is no such page yet: clicking that makes the page.
 */
function WikiLinkView({ node }: NodeViewProps) {
  const { onOpenPage } = useContext(PageLinksContext);
  const pageId = (node.attrs.page_id as string | null) || null;
  const typed = String(node.attrs.label || node.attrs.title || "");
  const publicPages = useContext(PublicPageLinksContext);
  const { data: peek } = usePagePeek(publicPages ? null : pageId);
  const base = {
    component: "span",
    "data-type": "wikiLink",
    contentEditable: false,
    sx: { color: "primary.main", borderBottom: 1, borderColor: "primary.main", cursor: "pointer" },
  } as const;

  if (!pageId) {
    return (
      <NodeViewWrapper as="span">
        <Box
          component="span"
          title="Unlinked. Use the page picker to choose a target."
          sx={{ color: "text.secondary", textDecoration: "underline dashed" }}
        >
          {typed}
        </Box>
      </NodeViewWrapper>
    );
  }
  if (peek?.locked || (publicPages && !publicPages.has(pageId))) {
    return (
      <NodeViewWrapper as="span">
        <Box
          {...base}
          data-locked="true"
          title="You don't have access to this page"
          sx={{
            ...base.sx,
            color: "text.secondary",
            borderColor: "text.disabled",
            cursor: "default",
            whiteSpace: "nowrap",
          }}
        >
          <LockOutlinedIcon sx={{ fontSize: "0.85em", mr: 0.25, verticalAlign: "-0.1em" }} />
          {typed}
        </Box>
      </NodeViewWrapper>
    );
  }
  const open = (e: MouseEvent | KeyboardEvent) => onOpenPage(pageId, { beside: e.shiftKey });
  return (
    <NodeViewWrapper as="span">
      <Box
        {...base}
        role="link"
        tabIndex={0}
        title={publicPages ? undefined : "Shift-click to open beside"}
        onClick={open}
        onKeyDown={activate(open)}
      >
        {(node.attrs.label as string) ||
          (publicPages
            ? publicPages.get(pageId) || "Untitled"
            : peek && !peek.locked
              ? peek.title || "Untitled"
              : typed)}
      </Box>
    </NodeViewWrapper>
  );
}

/** A #tag: click to see the pages with it. */
function HashtagView({ node }: NodeViewProps) {
  const { onOpenTag } = useContext(PageLinksContext);
  const tag = String(node.attrs.tag ?? "");
  return (
    <NodeViewWrapper as="span">
      <Box
        component="span"
        data-type="hashtag"
        contentEditable={false}
        role="link"
        tabIndex={0}
        onClick={() => onOpenTag(tag)}
        onKeyDown={activate(() => onOpenTag(tag))}
        sx={{ color: "primary.main", cursor: "pointer" }}
      >
        #{tag}
      </Box>
    </NodeViewWrapper>
  );
}

export const WikiLinkWithView = WikiLink.extend({ addNodeView: () => ReactNodeViewRenderer(WikiLinkView) });
export const HashtagWithView = Hashtag.extend({ addNodeView: () => ReactNodeViewRenderer(HashtagView) });
