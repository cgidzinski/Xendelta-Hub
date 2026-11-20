import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AvatarGroup, Box, Button, Chip, Drawer, IconButton, Tooltip, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import NotesIcon from "@mui/icons-material/Notes";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import PublicIcon from "@mui/icons-material/Public";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { closeSnackbar, useSnackbar } from "notistack";
import type { NoteColor } from "@shared/xennote/notes";
import UserAvatar from "../../../../components/user/UserAvatar";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import PageHeader from "../../../../components/ui/PageHeader";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { railPanelSx } from "../../../../components/ui/railStyles";
import { useTitle } from "../../../../hooks/useTitle";
import { useXenNoteCounts, useXenNotebooks } from "../../../../hooks/xennote/useXenNote";
import { useNotebookPageActions, useNotebookTree } from "../../../../hooks/xennote/usePages";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import NoteRail from "../components/NoteRail";
import NotebookDialog from "../components/NotebookDialog";
import PageList from "./PageList";
import PageView from "./PageView";
import SectionNameDialog from "./SectionNameDialog";
import SectionTabs from "./SectionTabs";
import { activeSectionId, moveNeighbour, pageNodes, previousTopLevel } from "./pageTree";

const BOARD = "/internal/xennote";

/**
 * A notebook as sections and pages: the rail, the notebook's name and people, its sections as tabs, the pages of the open
 * section, and the open page. On a phone it is a drill-down: the list of pages, then a page full screen.
 */
export default function NotebookView() {
  const { notebookId = "", pageId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();

  const { data: notebooks = [], isPending: loadingBooks } = useXenNotebooks();
  const { data: counts } = useXenNoteCounts();
  const { data: tree, isPending, isError, error, refetch } = useNotebookTree(notebookId);
  const actions = useNotebookPageActions(notebookId);
  const notebook = notebooks.find((b) => b._id === notebookId) ?? null;
  useTitle(notebook?.name ?? "XenNote");

  const [chosen, setChosen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [sectionDialog, setSectionDialog] = useState<{ section: XenNoteSection | null } | null>(null);
  const [notebookDialog, setNotebookDialog] = useState<{ tab?: "general" | "people" | "link" } | null>(null);

  const sections = tree?.sections ?? [];
  const pages = tree?.pages ?? [];
  const activeId = activeSectionId(sections, pages, pageId, chosen);
  const canEdit = notebook?.my_role === "owner" || notebook?.my_role === "editor";
  const fail = (e: unknown) => enqueueSnackbar((e as Error).message || "Couldn't save that", { variant: "error" });

  const openPage = (id: string) => navigate(`${BOARD}/b/${notebookId}/p/${id}`);
  const closePage = () => navigate(`${BOARD}/b/${notebookId}`);

  const createPage = async (parentId: string | null) => {
    if (!activeId) return;
    try {
      const made = await actions.createPage.mutateAsync({ sectionId: activeId, parent_id: parentId });
      openPage(made.page.id);
    } catch (e) {
      fail(e);
    }
  };

  // ---- sections
  const addSection = async (name: string) => {
    setSectionDialog(null);
    try {
      const made = await actions.createSection.mutateAsync({ name });
      setChosen(made.section.id);
      if (pageId) closePage();
    } catch (e) {
      fail(e);
    }
  };
  const renameSection = (section: XenNoteSection, name: string) => {
    setSectionDialog(null);
    actions.updateSection.mutate({ id: section.id, name }, { onError: fail });
  };
  const moveSection = (section: XenNoteSection, direction: "left" | "right") => {
    const at = sections.findIndex((s) => s.id === section.id);
    const target = sections[direction === "left" ? at - 1 : at + 1];
    if (!target) return;
    actions.moveSection.mutate(
      { id: section.id, ...(direction === "left" ? { before: target.id } : { after: target.id }) },
      { onError: fail },
    );
  };
  const deleteSection = async (section: XenNoteSection) => {
    const inIt = pages.filter((p) => p.section_id === section.id).length;
    const ok = await confirm({
      title: `Move "${section.name}" to the Trash?`,
      message: `${inIt === 0 ? "It has no pages." : `Its ${inIt} ${inIt === 1 ? "page goes" : "pages go"} with it.`} You can bring it back for 30 days.`,
      confirmLabel: "Move to Trash",
    });
    if (!ok) return;
    try {
      await actions.deleteSection.mutateAsync(section.id);
    } catch (e) {
      return fail(e);
    }
    if (chosen === section.id) setChosen(null);
    if (pageId && pages.find((p) => p.id === pageId)?.section_id === section.id) closePage();
    enqueueSnackbar("Section moved to Trash", {
      variant: "success",
      action: (key) => (
        <Button
          color="inherit"
          size="small"
          onClick={() => {
            closeSnackbar(key);
            actions.restoreSection.mutate(section.id, { onError: fail });
          }}
        >
          Undo
        </Button>
      ),
    });
  };

  // ---- pages
  const deletePage = async (page: PageTreeEntry) => {
    const ok = await confirm({
      title: "Move this page to the Trash?",
      message: "It and its sub-pages disappear for everyone. You can bring them back for 30 days.",
      confirmLabel: "Move to Trash",
    });
    if (!ok) return;
    try {
      await actions.deletePage.mutateAsync(page.id);
    } catch (e) {
      return fail(e);
    }
    if (pageId === page.id || pages.some((p) => p.id === pageId && p.parent_id === page.id)) closePage();
    enqueueSnackbar("Page moved to Trash", {
      variant: "success",
      action: (key) => (
        <Button
          color="inherit"
          size="small"
          onClick={() => {
            closeSnackbar(key);
            actions.restorePage.mutate(page.id, { onError: fail });
          }}
        >
          Undo
        </Button>
      ),
    });
  };

  // ---- the rail: the same one as the board, so moving between them feels like one place
  const rail = (
    <NoteRail
      scope={notebookId}
      onScope={(scope) =>
        navigate(notebooks.some((b) => b._id === scope) ? `${BOARD}/b/${scope}` : `${BOARD}?scope=${scope}`)
      }
      counts={counts}
      notebooks={notebooks}
      labels={[]}
      label={null}
      onLabel={() => undefined}
      onNewNote={canEdit && activeId ? () => void createPage(null) : undefined}
      newLabel="New page"
      onOpenNotebook={(id) => {
        setRailOpen(false);
        navigate(`${BOARD}/b/${id}`);
      }}
      onNewNotebook={() => {
        setRailOpen(false);
        navigate(`${BOARD}`);
      }}
    />
  );

  const openSection = (id: string) => {
    setChosen(id);
    if (pageId) closePage();
  };

  const header = notebook && (
    <PageHeader
      title={notebook.name}
      subtitle={`${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
      mb={1.5}
      actions={
        <>
          <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 13 } }}>
            {notebook.members.map((m) => (
              <UserAvatar key={m.user_id} user={m}>
                {m.username.slice(0, 1).toUpperCase()}
              </UserAvatar>
            ))}
          </AvatarGroup>
          {notebook.share?.enabled && (
            <Chip size="small" color="primary" variant="outlined" icon={<PublicIcon />} label="Link on" />
          )}
          {notebook.my_role === "owner" && (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<PersonAddAltOutlinedIcon />}
              onClick={() => setNotebookDialog({ tab: "people" })}
            >
              Share
            </Button>
          )}
          <Tooltip title="Notebook settings">
            <IconButton aria-label="Notebook settings" onClick={() => setNotebookDialog({})}>
              <SettingsOutlinedIcon />
            </IconButton>
          </Tooltip>
          {!wide && (
            <IconButton aria-label="Open notebooks" onClick={() => setRailOpen(true)}>
              <MenuBookOutlinedIcon />
            </IconButton>
          )}
        </>
      }
    />
  );

  const list = activeId && (
    <PageList
      nodes={pageNodes(pages, activeId, showArchived)}
      sections={sections}
      sectionId={activeId}
      activePageId={pageId}
      canEdit={canEdit}
      showArchived={showArchived}
      archivedCount={pages.filter((p) => p.section_id === activeId && p.archived).length}
      onShowArchived={setShowArchived}
      canNest={(p) => !!previousTopLevel(pages, p)}
      canMove={(p, d) => !!moveNeighbour(pages, p, d)}
      onOpen={openPage}
      onCreate={(parent) => void createPage(parent)}
      onFavorite={(p) => actions.favoritePage.mutate({ id: p.id, favorite: !p.favorite }, { onError: fail })}
      onMove={(p, d) => {
        const position = moveNeighbour(pages, p, d);
        if (position) actions.movePage.mutate({ id: p.id, ...position }, { onError: fail });
      }}
      onMoveToSection={(p, sectionId) =>
        actions.movePage.mutate({ id: p.id, section_id: sectionId }, { onError: fail })
      }
      onNest={(p) => {
        const above = previousTopLevel(pages, p);
        if (above) actions.movePage.mutate({ id: p.id, parent_id: above.id }, { onError: fail });
      }}
      onUnnest={(p) => actions.movePage.mutate({ id: p.id, parent_id: null }, { onError: fail })}
      onDelete={(p) => void deletePage(p)}
    />
  );

  let body;
  if (isPending || loadingBooks) {
    body = (
      <Box sx={{ p: 3 }}>
        <ListSkeleton rows={5} height={64} />
      </Box>
    );
  } else if (isError) {
    body = <ErrorDisplay error={error ?? null} title="Couldn't open this notebook" onRetry={() => refetch()} />;
  } else if (!notebook) {
    body = (
      <EmptyState
        icon={<MenuBookOutlinedIcon />}
        title="Notebook not found"
        description="It may have been deleted, or you may no longer be in it."
        action={<Button onClick={() => navigate(BOARD)}>Back to your notes</Button>}
      />
    );
  } else if (sections.length === 0) {
    body = (
      <EmptyState
        icon={<NotesIcon />}
        title="No sections yet"
        description="Sections are the tabs of a notebook. Add one, then fill it with pages."
        action={
          canEdit ? (
            <Button variant="contained" onClick={() => setSectionDialog({ section: null })}>
              Add a section
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    const pane = pageId ? (
      <PageView key={pageId} pageId={pageId} onBack={wide ? undefined : closePage} onGone={closePage} />
    ) : wide ? (
      <EmptyState
        icon={<NotesIcon />}
        title={pages.some((p) => p.section_id === activeId) ? "Pick a page" : "No pages yet"}
        description={canEdit ? "Open a page from the list, or start a new one." : "Open a page from the list."}
        action={
          canEdit ? (
            <Button variant="contained" onClick={() => void createPage(null)}>
              New page
            </Button>
          ) : undefined
        }
      />
    ) : null;

    body = (
      <>
        {/* On a phone an open page takes the whole screen, with its own way back. */}
        {(wide || !pageId) && (
          <SectionTabs
            sections={sections}
            activeId={activeId}
            onSelect={openSection}
            canEdit={canEdit}
            onAdd={() => setSectionDialog({ section: null })}
            onRename={(s) => setSectionDialog({ section: s })}
            onColor={(s, color: NoteColor) => actions.updateSection.mutate({ id: s.id, color }, { onError: fail })}
            onMove={moveSection}
            onDelete={(s) => void deleteSection(s)}
          />
        )}
        {wide ? (
          <Box sx={{ display: "flex", alignItems: "flex-start" }}>
            <Box
              sx={{
                flex: "0 0 320px",
                borderRight: 1,
                borderColor: "divider",
                p: 1.5,
                position: "sticky",
                top: 0,
                alignSelf: "flex-start",
                maxHeight: "calc(100vh - 64px)",
                overflowY: "auto",
              }}
            >
              {list}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>{pane}</Box>
          </Box>
        ) : pageId ? (
          pane
        ) : (
          <Box sx={{ p: 1.5 }}>{list}</Box>
        )}
      </>
    );
  }

  const mainHeader = wide || !pageId ? header : null;

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", minHeight: "calc(100vh - 64px)" }}>
        {wide ? (
          <Box sx={railPanelSx}>{rail}</Box>
        ) : (
          <Drawer
            open={railOpen}
            onClose={() => setRailOpen(false)}
            slotProps={{ paper: { sx: { width: 280, p: 1.5, pt: 9 } } }}
          >
            {rail}
          </Drawer>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {mainHeader && <Box sx={{ px: { xs: 1.5, sm: 3 }, pt: { xs: 2, sm: 3 } }}>{mainHeader}</Box>}
          {body}
        </Box>
      </Box>

      <SectionNameDialog
        open={!!sectionDialog}
        title={sectionDialog?.section ? "Rename section" : "Add a section"}
        initial={sectionDialog?.section?.name ?? ""}
        confirmLabel={sectionDialog?.section ? "Save" : "Add"}
        onClose={() => setSectionDialog(null)}
        onSubmit={(name) =>
          sectionDialog?.section ? renameSection(sectionDialog.section, name) : void addSection(name)
        }
      />
      <NotebookDialog
        open={!!notebookDialog}
        onClose={() => setNotebookDialog(null)}
        notebook={notebook}
        initialTab={notebookDialog?.tab}
        onGone={() => navigate(BOARD)}
      />
    </>
  );
}
