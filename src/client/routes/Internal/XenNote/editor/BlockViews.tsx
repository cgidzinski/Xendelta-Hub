import { createContext, useContext } from "react";
import { Box, Link, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { BlockRef, BlockEmbed } from "@shared/xennote/pageSchema";
import { blockTarget, type BlockPreview } from "@shared/xennote/blockReferences";
import { api } from "../../../../config/api";
import { useSocketInvalidate } from "../../../../hooks/useSocketEvent";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import { PageLinksContext } from "./pageLinksContext";

export type PublicBlockScope = { token: string; kind: "notebook" | "page" };
export const PublicBlockContext = createContext<PublicBlockScope | undefined>(undefined);

function BlockView({ node }: NodeViewProps) {
  const target = blockTarget(node.toJSON());
  const scope = useContext(PublicBlockContext);
  const { onOpenPage } = useContext(PageLinksContext);
  const pageId = target?.page_id ?? "";
  const blockId = target?.block_id ?? "";
  const token = scope?.token;
  const kind = scope?.kind;
  const key = xennoteKeys.blockPreview(pageId, blockId, token, kind);
  useSocketInvalidate<{ pageId: string }>("xennote:page_update", [key], (event) => !token && event.pageId === pageId);
  const preview = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<BlockPreview>(
        token
          ? `/api/xennote/public/${kind}/${token}/blocks/${pageId}/${blockId}`
          : `/api/xennote/pages/${pageId}/blocks/${blockId}`,
      ),
    enabled: !!target,
    retry: false,
    staleTime: 0,
  });
  const embed = node.type.name === "blockEmbed";
  const value = preview.error ? undefined : preview.data;
  const locked = !target || preview.error || value?.status === "locked";
  const available = value?.status === "available" ? value : undefined;
  return (
    <NodeViewWrapper as={embed ? "div" : "span"} contentEditable={false}>
      <Box
        component={embed ? "aside" : "span"}
        sx={
          embed
            ? { display: "block", border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, my: 1 }
            : { display: "inline", color: "text.secondary" }
        }
      >
        {locked ? (
          <>
            <LockOutlinedIcon sx={{ fontSize: 14, verticalAlign: "middle", mr: 0.5 }} />
            Locked block
          </>
        ) : value?.status === "removed" ? (
          "Block removed"
        ) : available ? (
          <>
            <Link component="button" variant="body2" onClick={() => onOpenPage(pageId)}>
              {embed ? available.title : available.excerpt.slice(0, 90)}
            </Link>
            {embed &&
              (available.type === "imageBlock" && available.url ? (
                <Box
                  component="img"
                  alt={available.excerpt}
                  src={available.url}
                  sx={{ display: "block", maxWidth: "100%", maxHeight: 420 }}
                />
              ) : available.url ? (
                <Link href={available.url} target="_blank" rel="noopener noreferrer" sx={{ display: "block" }}>
                  {available.name ?? "Open file"}
                </Link>
              ) : (
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {available.excerpt}
                </Typography>
              ))}
          </>
        ) : (
          "Loading block…"
        )}
      </Box>
    </NodeViewWrapper>
  );
}

export const BlockRefView = BlockRef.extend({ addNodeView: () => ReactNodeViewRenderer(BlockView) });
export const BlockEmbedView = BlockEmbed.extend({ addNodeView: () => ReactNodeViewRenderer(BlockView) });
