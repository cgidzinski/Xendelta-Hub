import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import type { BlockTarget } from "@shared/xennote/blockReferences";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import { suggestPages } from "../../../../hooks/xennote/usePages";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import { api } from "../../../../config/api";
import type { PageHit } from "../../../../types/XenNotePage";

export default function BlockPicker({
  mode,
  currentPage,
  onClose,
  onPick,
  onOpenPage,
}: {
  mode: "blockRef" | "blockEmbed" | "backlinks";
  currentPage: string;
  onClose: () => void;
  onPick: (target: BlockTarget) => void;
  onOpenPage: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, choosePage] = useState<PageHit>();
  const [selectedBlock, selectBlock] = useState<string>();
  const q = useDeferredValue(query.trim());
  const pageId = mode === "backlinks" ? currentPage : (page?.id ?? "");
  const pages = useQuery({
    queryKey: xennoteKeys.blockSearch(q),
    queryFn: () => suggestPages(q),
    enabled: mode !== "backlinks" && !!q && !page,
  });
  const blocks = useQuery({
    queryKey: xennoteKeys.pageBlocks(pageId),
    queryFn: () => api.get<Array<{ id: string; excerpt: string }>>(`/api/xennote/pages/${pageId}/blocks`),
    enabled: !!pageId,
  });
  const backlinks = useQuery({
    queryKey: xennoteKeys.blockBacklinks(pageId, selectedBlock ?? ""),
    queryFn: () =>
      api.get<Array<{ id: string; title: string }>>(`/api/xennote/pages/${pageId}/blocks/${selectedBlock}/backlinks`),
    enabled: !!selectedBlock,
  });
  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title={mode === "backlinks" ? "Block backlinks" : mode === "blockEmbed" ? "Embed a block" : "Link to a block"}
      actions={<Button onClick={onClose}>Close</Button>}
    >
      {!pageId ? (
        <>
          <TextField autoFocus fullWidth label="Find a page" value={query} onChange={(e) => setQuery(e.target.value)} />
          {pages.error ? (
            <Typography color="error">Couldn't find pages.</Typography>
          ) : pages.isFetching ? (
            <ListSkeleton rows={3} />
          ) : (
            <List>
              {pages.data?.map((result) => (
                <ListItemButton key={result.id} onClick={() => choosePage(result)}>
                  <ListItemText primary={result.title || "Untitled page"} secondary={result.notebook_name} />
                </ListItemButton>
              ))}
            </List>
          )}
        </>
      ) : (
        <>
          {page && <Button onClick={() => choosePage(undefined)}>Choose another page</Button>}
          {blocks.error ? (
            <Typography color="error">Couldn't load blocks.</Typography>
          ) : blocks.isPending ? (
            <ListSkeleton rows={4} />
          ) : (
            <List>
              {blocks.data?.map((block) => (
                <ListItemButton
                  key={block.id}
                  selected={block.id === selectedBlock}
                  onClick={() => {
                    if (mode === "backlinks") selectBlock(block.id);
                    else onPick({ page_id: pageId, block_id: block.id });
                  }}
                >
                  <ListItemText primary={block.excerpt} sx={{ overflowWrap: "anywhere" }} />
                </ListItemButton>
              ))}
            </List>
          )}
          {selectedBlock &&
            (backlinks.isPending ? (
              <ListSkeleton rows={2} />
            ) : backlinks.error ? (
              <Typography color="error">Couldn't load backlinks.</Typography>
            ) : backlinks.data.length === 0 ? (
              <Typography>No pages link to this block.</Typography>
            ) : (
              <List aria-label="Pages linking to this block">
                {backlinks.data.map((row) => (
                  <ListItemButton key={row.id} onClick={() => onOpenPage(row.id)}>
                    <ListItemText primary={row.title || "Untitled page"} />
                  </ListItemButton>
                ))}
              </List>
            ))}
        </>
      )}
    </ResponsiveDialog>
  );
}
