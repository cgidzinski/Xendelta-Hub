import { useState } from "react";
import {
  Box,
  FormControlLabel,
  IconButton,
  ListItemButton,
  ListSubheader,
  Menu,
  MenuItem,
  Switch,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarIcon from "@mui/icons-material/Star";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import { railItemSx } from "../../../../components/ui/railStyles";
import { swatchColor } from "../noteColors";
import { pageTitle, type PageDrop } from "./pageTree";
import { reorderRowSx, useListDrag, type ReorderRowProps } from "./useListDrag";

export interface PageActions {
  onOpen: (id: string) => void;
  onFavorite: (page: PageTreeEntry) => void;
  onReorder: (id: string, position: { before?: string; after?: string }) => void;
  onMoveToSection: (page: PageTreeEntry, sectionId: string) => void;
  onDelete: (page: PageTreeEntry) => void;
}

interface PageListProps extends PageActions {
  pages: PageTreeEntry[];
  sections: XenNoteSection[];
  sectionId: string;
  activePageId: string | undefined;
  canEdit: boolean;
  showArchived: boolean;
  /** How many archived pages the section has (the switch only shows when there are some). */
  archivedCount: number;
  onShowArchived: (show: boolean) => void;
  reordering: boolean;
}

function PageRow({
  page,
  selected,
  canEdit,
  onOpen,
  onMenu,
  dragging,
  dropEdge,
  reorder,
}: {
  page: PageTreeEntry;
  selected: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
  dragging: boolean;
  dropEdge?: PageDrop["edge"];
  reorder?: ReorderRowProps;
}) {
  const theme = useTheme();
  const dot = swatchColor(theme, page.color as never);
  return (
    <Box
      data-page-row={page.id}
      sx={{
        display: "flex",
        alignItems: "center",
        position: "relative",
        opacity: dragging ? 0.4 : page.archived ? 0.6 : 1,
        ...(dropEdge && {
          "&::after": {
            content: '""',
            position: "absolute",
            insetInline: 0,
            [dropEdge === "before" ? "top" : "bottom"]: -3,
            height: 2,
            bgcolor: "primary.main",
            borderRadius: 1,
            pointerEvents: "none",
          },
        }),
      }}
    >
      <ListItemButton
        component="button"
        type="button"
        selected={selected}
        aria-current={selected ? "page" : undefined}
        onClick={onOpen}
        {...reorder}
        sx={{
          ...railItemSx,
          ...(reorder && reorderRowSx(dragging)),
          flexGrow: 1,
          pr: 0.75,
          gap: 0.75,
          minWidth: 0,
          textAlign: "left",
        }}
      >
        {dot && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dot, flexShrink: 0 }} />}
        <Typography variant="body2" noWrap sx={{ fontWeight: "inherit", flex: 1 }}>
          {pageTitle(page.title)}
        </Typography>
        {page.todo.open > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {page.todo.open}
          </Typography>
        )}
        {page.favorite && (
          <StarIcon aria-label="Favourite" sx={{ fontSize: 16, color: "warning.main", flexShrink: 0 }} />
        )}
      </ListItemButton>
      {canEdit && (
        <IconButton
          aria-label={`Actions for ${pageTitle(page.title)}`}
          size="small"
          onClick={(e) => onMenu(e.currentTarget)}
          sx={{ width: 40, height: 40, borderRadius: 1, ml: 0.5, mr: 1, flexShrink: 0 }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

/** The pages of the open section. */
export default function PageList(props: PageListProps) {
  const { pages, sections, sectionId, activePageId, canEdit, showArchived, archivedCount, onShowArchived, reordering } =
    props;
  const { listProps, drag, getRowProps } = useListDrag("data-page-row", props.onReorder);
  const canReorder =
    canEdit &&
    !reordering &&
    pages.length > 1 &&
    sections.find((section) => section.id === sectionId)?.kind !== "journal";
  const [menu, setMenu] = useState<{ anchor: HTMLElement; page: PageTreeEntry } | null>(null);
  const close = () => setMenu(null);
  const page = menu?.page;
  const pick = (run: () => void) => () => {
    close();
    run();
  };
  return (
    <Box {...listProps} sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {pages.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.75, py: 0.75 }}>
          No pages
        </Typography>
      )}

      {pages.map((page) => (
        <PageRow
          key={page.id}
          page={page}
          selected={page.id === activePageId}
          canEdit={canEdit}
          onOpen={() => props.onOpen(page.id)}
          onMenu={(anchor) => setMenu({ anchor, page })}
          dragging={drag?.id === page.id}
          dropEdge={drag?.target?.id === page.id ? drag.target.edge : undefined}
          reorder={canReorder ? getRowProps(page.id) : undefined}
        />
      ))}

      {(archivedCount > 0 || showArchived) && (
        <FormControlLabel
          sx={{ mt: 0.5, ml: 1.75 }}
          control={<Switch size="small" checked={showArchived} onChange={(e) => onShowArchived(e.target.checked)} />}
          label={<Typography variant="caption">Show archived</Typography>}
        />
      )}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={close}>
        {page && (
          <MenuItem onClick={pick(() => props.onFavorite(page))}>
            {page.favorite ? "Remove from favourites" : "Add to favourites"}
          </MenuItem>
        )}
        {page && sections.filter((s) => s.id !== sectionId && s.kind !== "journal").length > 0 && (
          <ListSubheader sx={{ lineHeight: 2 }}>Move to section</ListSubheader>
        )}
        {page &&
          sections
            .filter((s) => s.id !== sectionId && s.kind !== "journal")
            .map((s) => (
              <MenuItem key={s.id} onClick={pick(() => props.onMoveToSection(page, s.id))}>
                {s.name}
              </MenuItem>
            ))}
        {page && (
          <MenuItem onClick={pick(() => props.onDelete(page))} sx={{ color: "error.main" }}>
            Delete
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
