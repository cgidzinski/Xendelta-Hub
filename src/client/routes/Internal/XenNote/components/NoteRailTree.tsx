import { useCallback, useEffect, useState } from "react";
import { Link, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Box, ListItemButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import StarIcon from "@mui/icons-material/Star";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import { railItemSx } from "../../../../components/ui/railStyles";
import { useNotebookTree } from "../../../../hooks/xennote/usePages";
import type { XenNotebook } from "../../../../types/XenNote";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import { swatchColor } from "../noteColors";
import { byOrder, pageTitle, pagesInSection } from "../notebook/pageTree";
import { closedNodes, openAtRoute, toggleOpen, type OpenNodes } from "../railTree";

const BOARD = "/internal/xennote";

/** A nested row: the rail's row, indented, and a little tighter so a whole notebook fits on a phone. */
const nestedRowSx = (pl: number) => ({ ...railItemSx, pl, height: 40, gap: 1, textAlign: "left" }) as const;
const chevronSx = (open: boolean) => ({
  fontSize: 18,
  flexShrink: 0,
  transform: open ? "rotate(0deg)" : "rotate(-90deg)",
  transition: "transform 150ms",
});

/**
 * The rail as a tree on a phone: a notebook opens to its sections, a section to its pages. Only an open
 * notebook loads its tree, and that data is the same query the notebook screen reads.
 */
export default function NoteRailTree({
  notebooks,
  sharedStatus,
  onNavigate,
}: {
  notebooks: XenNotebook[];
  sharedStatus: ReadonlyMap<string, "new" | "changed" | null>;
  /** Closes the drawer: called when a page is picked, not when a notebook or section opens. */
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const notebookId = useMatch(`${BOARD}/b/:notebookId/*`)?.params.notebookId;
  const pageId = useMatch(`${BOARD}/b/:notebookId/p/:pageId`)?.params.pageId;
  const [params] = useSearchParams();
  const chosenSection = params.get("section") ?? undefined;
  const [open, setOpen] = useState<OpenNodes>(closedNodes);

  // A deep link, or a page opened from search, reveals its branch without closing what is already open.
  useEffect(() => {
    setOpen((current) => openAtRoute(current, notebookId, chosenSection));
  }, [notebookId, chosenSection]);

  const toggleNotebook = useCallback(
    (id: string) => setOpen((current) => ({ ...current, notebooks: toggleOpen(current.notebooks, id) })),
    [],
  );
  const toggleSection = useCallback(
    (id: string) => setOpen((current) => ({ ...current, sections: toggleOpen(current.sections, id) })),
    [],
  );
  const openSection = useCallback(
    (id: string) =>
      setOpen((current) =>
        current.sections.has(id) ? current : { ...current, sections: new Set(current.sections).add(id) },
      ),
    [],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {notebooks.map((book) => (
        <NotebookBranch
          key={book._id}
          book={book}
          open={open.notebooks.has(book._id)}
          openSections={open.sections}
          notebookId={notebookId}
          pageId={pageId}
          status={sharedStatus.get(book._id) ?? null}
          onExpand={toggleNotebook}
          onToggleSection={toggleSection}
          onOpenSection={openSection}
          onOpenNotebook={(id) => navigate(`${BOARD}/b/${id}`)}
          onNavigate={onNavigate}
        />
      ))}
    </Box>
  );
}

function NotebookBranch({
  book,
  open,
  openSections,
  notebookId,
  pageId,
  status,
  onExpand,
  onToggleSection,
  onOpenSection,
  onOpenNotebook,
  onNavigate,
}: {
  book: XenNotebook;
  open: boolean;
  openSections: ReadonlySet<string>;
  notebookId: string | undefined;
  pageId: string | undefined;
  status: "new" | "changed" | null;
  onExpand: (id: string) => void;
  onToggleSection: (id: string) => void;
  onOpenSection: (id: string) => void;
  onOpenNotebook: (id: string) => void;
  onNavigate: () => void;
}) {
  const theme = useTheme();
  const { data, isPending } = useNotebookTree(open ? book._id : undefined);
  const sections = (data?.sections ?? []).toSorted(byOrder);
  const pages = data?.pages ?? [];

  // The open page may have been reached without its section in the URL (an old link, or a search result).
  const openPageSection = pageId ? pages.find((page) => page.id === pageId)?.section_id : undefined;
  useEffect(() => {
    if (open && openPageSection) onOpenSection(openPageSection);
  }, [open, openPageSection, onOpenSection]);

  const color = swatchColor(theme, book.color);
  const sharedLabel = status === "new" ? "New shared notebook" : "Shared notebook updated";

  return (
    <Box>
      <ListItemButton
        component="button"
        type="button"
        aria-expanded={open}
        selected={book._id === notebookId}
        onClick={() => {
          onExpand(book._id);
          onOpenNotebook(book._id);
        }}
        sx={{ ...railItemSx, width: "100%", textAlign: "left" }}
      >
        <Box sx={{ display: "flex", alignItems: "center", width: 20, justifyContent: "center", flexShrink: 0 }}>
          {color ? (
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
          ) : (
            <MenuBookOutlinedIcon />
          )}
        </Box>
        <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: "inherit", fontSize: "inherit" }}>
          {book.name}
        </Typography>
        {book.my_role !== "owner" && (
          <Tooltip title={sharedLabel}>
            <Badge variant="dot" color="primary" invisible={!status}>
              <PeopleOutlineIcon fontSize="small" titleAccess={sharedLabel} />
            </Badge>
          </Tooltip>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {book.page_count}
        </Typography>
        <ExpandMoreIcon aria-hidden sx={chevronSx(open)} />
      </ListItemButton>

      {open && isPending && (
        <Box sx={{ pl: 5, pr: 1, py: 0.5 }}>
          <ListSkeleton rows={3} height={28} gap={0.5} />
        </Box>
      )}

      {open && !isPending && sections.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", pl: 5, py: 0.75 }}>
          No sections yet
        </Typography>
      )}

      {open &&
        !isPending &&
        sections.map((section) => (
          <SectionBranch
            key={section.id}
            section={section}
            pages={pagesInSection(pages, section.id)}
            open={openSections.has(section.id)}
            notebookId={book._id}
            pageId={pageId}
            onExpand={onToggleSection}
            onNavigate={onNavigate}
          />
        ))}
    </Box>
  );
}

function SectionBranch({
  section,
  pages,
  open,
  notebookId,
  pageId,
  onExpand,
  onNavigate,
}: {
  section: XenNoteSection;
  pages: PageTreeEntry[];
  open: boolean;
  notebookId: string;
  pageId: string | undefined;
  onExpand: (id: string) => void;
  onNavigate: () => void;
}) {
  const theme = useTheme();
  const color = swatchColor(theme, section.color);

  return (
    <Box>
      <ListItemButton
        component="button"
        type="button"
        aria-expanded={open}
        onClick={() => onExpand(section.id)}
        sx={{ ...nestedRowSx(3.5), width: "100%" }}
      >
        {color && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />}
        <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: "inherit", fontSize: "inherit" }}>
          {section.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {pages.length}
        </Typography>
        <ExpandMoreIcon aria-hidden sx={chevronSx(open)} />
      </ListItemButton>

      {open &&
        pages.map((page) => (
          <ListItemButton
            key={page.id}
            component={Link}
            to={`${BOARD}/b/${notebookId}/p/${page.id}`}
            selected={page.id === pageId}
            aria-current={page.id === pageId ? "page" : undefined}
            onClick={onNavigate}
            sx={{ ...nestedRowSx(5), gap: 0.75 }}
          >
            <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: "inherit", fontSize: "inherit" }}>
              {pageTitle(page.title)}
            </Typography>
            {page.favorite && (
              <StarIcon aria-label="Favourite" sx={{ fontSize: 14, color: "warning.main", flexShrink: 0 }} />
            )}
          </ListItemButton>
        ))}

      {open && pages.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", pl: 6.5, py: 0.75 }}>
          No pages yet
        </Typography>
      )}
    </Box>
  );
}
