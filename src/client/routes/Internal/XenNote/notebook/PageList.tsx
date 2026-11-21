import { useState } from "react";
import {
  Box,
  Chip,
  FormControlLabel,
  IconButton,
  ListSubheader,
  Menu,
  MenuItem,
  Switch,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarIcon from "@mui/icons-material/Star";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
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
        position: "relative",
        alignItems: "stretch",
        border: 1,
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : "background.paper",
        borderRadius: 2,
        opacity: dragging ? 0.4 : page.archived ? 0.6 : 1,
        ...(dropEdge && {
          "&::after": {
            content: '""',
            position: "absolute",
            insetInline: 0,
            [dropEdge === "before" ? "top" : "bottom"]: -5,
            height: 2,
            bgcolor: "primary.main",
            borderRadius: 1,
            pointerEvents: "none",
          },
        }),
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={onOpen}
        {...reorder}
        aria-current={selected ? "page" : undefined}
        sx={{
          all: "unset",
          boxSizing: "border-box",
          flex: 1,
          minWidth: 0,
          cursor: "pointer",
          px: 1.5,
          py: 1.25,
          borderRadius: 2,
          ...(reorder && reorderRowSx(dragging)),
          "&:focus-visible": { outline: 2, outlineStyle: "solid", outlineColor: "primary.main" },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          {dot && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dot, flexShrink: 0 }} />}
          <Typography noWrap sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}>
            {pageTitle(page.title)}
          </Typography>
          {page.favorite && <StarIcon aria-label="Favourite" sx={{ fontSize: 16, color: "warning.main" }} />}
        </Box>
        {(page.excerpt || page.todo.open > 0) && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
              {page.excerpt}
            </Typography>
            {page.todo.open > 0 && <Chip size="small" variant="outlined" label={`${page.todo.open} open`} />}
          </Box>
        )}
      </Box>
      {canEdit && (
        <IconButton
          aria-label={`Actions for ${pageTitle(page.title)}`}
          size="small"
          onClick={(e) => onMenu(e.currentTarget)}
          sx={{ alignSelf: "center", mr: 0.5 }}
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
    canEdit && !reordering && pages.length > 1 && sections.find((section) => section.id === sectionId)?.kind !== "journal";
  const [menu, setMenu] = useState<{ anchor: HTMLElement; page: PageTreeEntry } | null>(null);
  const close = () => setMenu(null);
  const page = menu?.page;
  const pick = (run: () => void) => () => {
    close();
    run();
  };
  return (
    <Box {...listProps} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {pages.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 0.5, py: 0.75 }}>
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
          sx={{ mt: 0.5, ml: 0.5 }}
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
