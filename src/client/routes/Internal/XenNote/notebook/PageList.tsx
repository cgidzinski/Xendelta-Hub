import { useState } from "react";
import {
  Box,
  Button,
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
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StarIcon from "@mui/icons-material/Star";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { swatchColor } from "../noteColors";
import { pageTitle, type PageNode } from "./pageTree";

export interface PageActions {
  onOpen: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onFavorite: (page: PageTreeEntry) => void;
  onMove: (page: PageTreeEntry, direction: "up" | "down") => void;
  onMoveToSection: (page: PageTreeEntry, sectionId: string) => void;
  onNest: (page: PageTreeEntry) => void;
  onUnnest: (page: PageTreeEntry) => void;
  onDelete: (page: PageTreeEntry) => void;
}

interface PageListProps extends PageActions {
  nodes: PageNode[];
  sections: XenNoteSection[];
  sectionId: string;
  activePageId: string | undefined;
  canEdit: boolean;
  showArchived: boolean;
  /** How many archived pages the section has (the switch only shows when there are some). */
  archivedCount: number;
  onShowArchived: (show: boolean) => void;
  /** The first top-level page can't be nested; this says which pages can be (those with a page above them). */
  canNest: (page: PageTreeEntry) => boolean;
  canMove: (page: PageTreeEntry, direction: "up" | "down") => boolean;
}

function PageRow({
  page,
  nested,
  selected,
  canEdit,
  onOpen,
  onMenu,
}: {
  page: PageTreeEntry;
  nested: boolean;
  selected: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
}) {
  const theme = useTheme();
  const dot = swatchColor(theme, page.color as never);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        ml: nested ? 3 : 0,
        border: 1,
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : "background.paper",
        borderRadius: 2,
        opacity: page.archived ? 0.6 : 1,
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={onOpen}
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

/** The pages of the open section: top-level pages with their sub-pages indented, and a menu on each. */
export default function PageList(props: PageListProps) {
  const {
    nodes,
    sections,
    sectionId,
    activePageId,
    canEdit,
    showArchived,
    archivedCount,
    onShowArchived,
    canNest,
    canMove,
  } = props;
  const [menu, setMenu] = useState<{ anchor: HTMLElement; page: PageTreeEntry } | null>(null);
  const close = () => setMenu(null);
  const page = menu?.page;
  const pick = (run: () => void) => () => {
    close();
    run();
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", px: 0.5 }}>
        <Typography variant="caption" sx={{ ...sectionLabelSx, flex: 1 }}>
          Pages
        </Typography>
        {canEdit && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => props.onCreate(null)}>
            New page
          </Button>
        )}
      </Box>

      {nodes.map(({ page: p, children }) => (
        <Box key={p.id} sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <PageRow
            page={p}
            nested={false}
            selected={p.id === activePageId}
            canEdit={canEdit}
            onOpen={() => props.onOpen(p.id)}
            onMenu={(anchor) => setMenu({ anchor, page: p })}
          />
          {children.map((c) => (
            <PageRow
              key={c.id}
              page={c}
              nested
              selected={c.id === activePageId}
              canEdit={canEdit}
              onOpen={() => props.onOpen(c.id)}
              onMenu={(anchor) => setMenu({ anchor, page: c })}
            />
          ))}
        </Box>
      ))}

      {(archivedCount > 0 || showArchived) && (
        <FormControlLabel
          sx={{ mt: 0.5, ml: 0.5 }}
          control={<Switch size="small" checked={showArchived} onChange={(e) => onShowArchived(e.target.checked)} />}
          label={<Typography variant="caption">Show archived</Typography>}
        />
      )}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={close}>
        {page && !page.parent_id && <MenuItem onClick={pick(() => props.onCreate(page.id))}>Add a sub-page</MenuItem>}
        {page && (
          <MenuItem onClick={pick(() => props.onFavorite(page))}>
            {page.favorite ? "Remove from favourites" : "Add to favourites"}
          </MenuItem>
        )}
        {page && (
          <MenuItem disabled={!canMove(page, "up")} onClick={pick(() => props.onMove(page, "up"))}>
            Move up
          </MenuItem>
        )}
        {page && (
          <MenuItem disabled={!canMove(page, "down")} onClick={pick(() => props.onMove(page, "down"))}>
            Move down
          </MenuItem>
        )}
        {page && !page.parent_id && canNest(page) && (
          <MenuItem onClick={pick(() => props.onNest(page))}>Make it a sub-page of the page above</MenuItem>
        )}
        {page?.parent_id && <MenuItem onClick={pick(() => props.onUnnest(page))}>Make it a top-level page</MenuItem>}
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
