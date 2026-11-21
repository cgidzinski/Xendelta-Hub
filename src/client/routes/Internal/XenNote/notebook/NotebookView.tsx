import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import TodayOutlinedIcon from "@mui/icons-material/TodayOutlined";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { api } from "../../../../config/api";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import { downloadMarkdown } from "../../../../hooks/xennote/downloadMarkdown";
import {
  AvatarGroup,
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemText,
  List,
  ListItemButton,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import NotesIcon from "@mui/icons-material/Notes";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import PublicIcon from "@mui/icons-material/Public";
import CloseIcon from "@mui/icons-material/Close";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { closeSnackbar, useSnackbar } from "notistack";
import UserAvatar from "../../../../components/user/UserAvatar";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import PageHeader from "../../../../components/ui/PageHeader";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useAuth } from "../../../../contexts/AuthContext";
import { getRawStored, setRawStored } from "../../../../hooks/useLocalStorageState";
import { useTitle } from "../../../../hooks/useTitle";
import { useXenNotebooks } from "../../../../hooks/xennote/useXenNote";
import { useMarkSharedNotebookSeen } from "../../../../hooks/xennote/usePageSharing";
import { useNotebookPageActions, useNotebookTree } from "../../../../hooks/xennote/usePages";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import NoteNavButton from "../components/NoteNavButton";
import NotebookDialog from "../components/NotebookDialog";
import type { PageLinksValue } from "../editor/pageLinksContext";
import PageList from "./PageList";
import SearchResults, { SearchBox } from "./NotebookSearch";
import TagPage from "./TagPage";
import TagsMenu from "./TagsMenu";
import PageView from "./PageView";
import SectionNameDialog from "./SectionNameDialog";
import SectionList from "./SectionList";
import SectionOptions from "./SectionOptions";
import { activeSectionId, pagesInSection, pageTitle } from "./pageTree";
import { lazyPage } from "../../../../utils/lazyPage";

const BOARD = "/internal/xennote";
const PAGES_SIDEBAR_WIDTH = 320;
const NOTEBOOK_CONTENT_WIDTH = 1200;
const TasksPane = lazyPage(() => import("./TasksView"));
const GraphPane = lazyPage(() => import("./GraphView"));
const lastPageKey = (userId: string, notebookId: string, sectionId: string) =>
  `xennote:last-page:${userId}:${notebookId}:${sectionId}`;

/**
 * A notebook as sections and pages: the rail, the notebook's name and people, the section list, the pages of the open
 * section, and the open page. On a phone it is a drill-down: the list of pages, then a page full screen.
 */
export default function NotebookView({ tool }: { tool?: "tasks" | "graph" }) {
  const { notebookId = "", pageId, tag: tagParam } = useParams();
  const tag = tagParam ? decodeURIComponent(tagParam) : undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // A second page open beside the first (desktop): /internal/xennote/b/<id>/p/<id>?beside=<id>.
  const beside = searchParams.get("beside");
  const chosen = searchParams.get("section");
  const requestedTool = searchParams.get("tool");
  const toolName = requestedTool?.replace(/^notebook-/, "");
  const activeTool = tool ?? (toolName === "tasks" || toolName === "graph" ? toolName : undefined);
  const toolNotebookId = tool || requestedTool?.startsWith("notebook-") ? notebookId : undefined;
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { user } = useAuth();

  const { data: notebooks = [], isPending: loadingBooks } = useXenNotebooks();
  const { data: tree, isPending, isError, error, refetch } = useNotebookTree(notebookId);
  const actions = useNotebookPageActions(notebookId);
  const notebook = notebooks.find((b) => b._id === notebookId) ?? null;
  useMarkSharedNotebookSeen(notebook?.my_role !== "owner" ? notebook?._id : undefined, tree?.viewed_at);

  const queryClient = useQueryClient();
  const [optionsMenu, setOptionsMenu] = useState<HTMLElement | null>(null);
  const [templateDialog, setTemplateDialog] = useState<"create" | "journal" | null>(null);
  const [toolBusy, setToolBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [sectionDialog, setSectionDialog] = useState<{ section: XenNoteSection | null } | null>(null);
  const [notebookDialog, setNotebookDialog] = useState<{ tab?: "general" | "people" | "link" } | null>(null);

  const sections = tree?.sections ?? [];
  const pages = useMemo(() => tree?.pages ?? [], [tree]);
  const lastPages = useRef(new Map<string, string>());
  const openPageEntry = pages.find((page) => page.id === pageId);
  const openPageSectionId = openPageEntry?.section_id;
  const openPageSection = sections.find((section) => section.id === openPageSectionId);
  const pageHeading =
    !activeTool && notebook && openPageSection && openPageEntry
      ? [notebook.name, openPageSection.name, pageTitle(openPageEntry.title)].join(" - ")
      : undefined;
  useTitle(activeTool ? "" : (pageHeading ?? notebook?.name ?? "XenNote"));
  useEffect(() => {
    if (!pageId || !openPageSectionId || activeTool) return;
    const key = lastPageKey(user.id, notebookId, openPageSectionId);
    lastPages.current.set(key, pageId);
    setRawStored(key, pageId);
  }, [activeTool, notebookId, openPageSectionId, pageId, user.id]);
  const activeId = activeSectionId(sections, pages, pageId, chosen);
  const activeSection = sections.find((s) => s.id === activeId);
  const navigationSection = sections.find((section) => section.id === chosen) ?? (pageId ? activeSection : undefined);
  const sidebarSection = searchParams.get("nav") === "sections" ? undefined : navigationSection;
  const pageCreationSection = sidebarSection ?? activeSection;
  const templateSection = sections.find((s) => s.kind === "templates");
  const templates = pages.filter(
    (page) => !!templateSection && page.section_id === templateSection.id && !page.archived,
  );
  const today = format(new Date(), "yyyy-MM-dd");
  const canEdit = notebook?.my_role === "owner" || notebook?.my_role === "editor";
  const fail = (e: unknown) => enqueueSnackbar((e as Error).message || "Couldn't save that", { variant: "error" });

  const notebookPath = `${BOARD}/b/${notebookId}`;
  // The chosen section and the page beside survive navigation between notebook views.
  const pageParams = new URLSearchParams(searchParams);
  pageParams.delete("tool");
  const openPage = (id: string) => {
    const params = new URLSearchParams(pageParams);
    const sectionId = pages.find((page) => page.id === id)?.section_id;
    params.delete("nav");
    if (sectionId) params.set("section", sectionId);
    else params.delete("section");
    navigate({ pathname: `${notebookPath}/p/${id}`, search: params.toString() });
  };
  const closePage = () => {
    const params = new URLSearchParams(pageParams);
    if (pageId && activeId && !chosen) params.set("section", activeId);
    navigate({ pathname: notebookPath, search: params.toString() });
  };
  const openTag = (name: string) =>
    navigate({ pathname: `${notebookPath}/t/${encodeURIComponent(name)}`, search: pageParams.toString() });
  const openBeside = (id: string | null) => {
    const params = new URLSearchParams(pageParams);
    if (id) params.set("beside", id);
    else params.delete("beside");
    navigate({ pathname: location.pathname, search: params.toString() });
  };
  const openSection = (id: string) => {
    const params = new URLSearchParams(pageParams);
    params.set("section", id);
    params.delete("nav");
    navigate({ pathname: notebookPath, search: params.toString() });
  };
  const showSectionPages = (id: string) => {
    const key = lastPageKey(user.id, notebookId, id);
    const remembered = getRawStored(key) ?? lastPages.current.get(key);
    if (
      remembered &&
      pages.some((page) => page.id === remembered && page.section_id === id && (showArchived || !page.archived))
    ) {
      openPage(remembered);
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set("section", id);
    params.delete("nav");
    setSearchParams(params);
  };
  const showSections = () => {
    setQuery("");
    const params = new URLSearchParams(searchParams);
    params.set("nav", "sections");
    setSearchParams(params);
  };
  const openTool = (next: "tasks" | "graph") => {
    setOptionsMenu(null);
    const params = new URLSearchParams(pageParams);
    params.set("tool", `notebook-${next}`);
    navigate({ pathname: tool ? notebookPath : location.pathname, search: params.toString() });
  };

  const runNotebookTool = async (run: () => Promise<void>) => {
    setOptionsMenu(null);
    setToolBusy(true);
    try {
      await run();
    } catch (error) {
      fail(error);
    } finally {
      setToolBusy(false);
    }
  };
  const refreshTree = () => queryClient.invalidateQueries({ queryKey: xennoteKeys.tree(notebookId) });
  const openToday = () =>
    runNotebookTool(async () => {
      const page = await api.post<{ id: string }>(`/api/xennote/notebooks/${notebookId}/journal`, { date: today });
      await refreshTree();
      openPage(page.id);
    });
  const openTemplates = () =>
    runNotebookTool(async () => {
      const id =
        templateSection?.id ??
        (await api.post<{ section: XenNoteSection }>(`/api/xennote/notebooks/${notebookId}/templates`)).section.id;
      await refreshTree();
      openSection(id);
    });
  const applyTemplate = (id: string | null) =>
    runNotebookTool(async () => {
      if (templateDialog === "journal") {
        await api.put(`/api/xennote/notebooks/${notebookId}/journal-template`, { page_id: id });
        await queryClient.invalidateQueries({ queryKey: xennoteKeys.notebooks() });
        setTemplateDialog(null);
      } else if (id && sidebarSection) {
        const page = await api.post<{ id: string }>(`/api/xennote/sections/${sidebarSection.id}/from-template`, {
          template_id: id,
        });
        await refreshTree();
        setTemplateDialog(null);
        openPage(page.id);
      }
    });

  const createPage = async () => {
    if (!pageCreationSection) return;
    if (pageCreationSection.kind === "journal") return openToday();
    try {
      const made = await actions.createPage.mutateAsync({ sectionId: pageCreationSection.id });
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
      openSection(made.section.id);
    } catch (e) {
      fail(e);
    }
  };
  const renameSection = (section: XenNoteSection, name: string) => {
    setSectionDialog(null);
    actions.updateSection.mutate({ id: section.id, name }, { onError: fail });
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
    const params = new URLSearchParams(searchParams);
    if (chosen === section.id) params.delete("section");
    if (pageId && pages.find((p) => p.id === pageId)?.section_id === section.id) {
      navigate({ pathname: notebookPath, search: params.toString() }, { replace: true });
    } else if (chosen === section.id) {
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
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
      message: "It disappears for everyone. You can bring them back for 30 days.",
      confirmLabel: "Move to Trash",
    });
    if (!ok) return;
    try {
      await actions.deletePage.mutateAsync(page.id);
    } catch (e) {
      return fail(e);
    }
    if (pageId === page.id) closePage();
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

  // ---- tags used in this notebook, and what links and tags in a page's text do
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pages) if (!p.archived) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ tag: name, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [pages]);
  const links: PageLinksValue = {
    notebookId,
    onOpenPage: (id, options) => (options?.beside && wide ? openBeside(id) : openPage(id)),
    onOpenTag: openTag,
    // A link to a page that doesn't exist yet makes it in the open section (without leaving this page).
    onCreatePage: async (title) => {
      if (!activeId || !canEdit) return null;
      try {
        return (await actions.createPage.mutateAsync({ sectionId: activeId, title })).page.id;
      } catch (e) {
        fail(e);
        return null;
      }
    },
    tags: () => tagCounts.map((t) => t.tag),
  };

  const header = notebook && (
    <PageHeader
      title={
        pageHeading ? (
          <Box component="span" sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
            {pageHeading}
          </Box>
        ) : (
          notebook.name
        )
      }
      subtitle={`${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
      mb={1.5}
      actions={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          {canEdit && pageCreationSection && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={actions.createPage.isPending || toolBusy}
              onClick={() => void createPage()}
            >
              New page
            </Button>
          )}
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
          <Tooltip title="Notebook tools">
            <IconButton aria-label="Notebook tools" onClick={(e) => setOptionsMenu(e.currentTarget)}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={optionsMenu} open={!!optionsMenu} onClose={() => setOptionsMenu(null)}>
            <MenuItem onClick={() => openTool("graph")}>Graph</MenuItem>
            <MenuItem onClick={() => openTool("tasks")}>Tasks</MenuItem>
            {(canEdit || pages.some((p) => p.journal_date === today)) && (
              <MenuItem disabled={toolBusy} onClick={() => void openToday()}>
                Today's page
              </MenuItem>
            )}
            {(canEdit || !!templateSection) && (
              <MenuItem disabled={toolBusy} onClick={() => void openTemplates()}>
                Templates
              </MenuItem>
            )}
            {canEdit && !!templates.length && (
              <MenuItem
                onClick={() => {
                  setOptionsMenu(null);
                  setTemplateDialog("journal");
                }}
              >
                Journal template
              </MenuItem>
            )}
            <MenuItem
              disabled={toolBusy}
              onClick={() => void runNotebookTool(() => downloadMarkdown("notebooks", notebookId, notebook.name))}
            >
              Export notebook as Markdown
            </MenuItem>
          </Menu>
          <Tooltip title="Notebook settings">
            <IconButton aria-label="Notebook settings" onClick={() => setNotebookDialog({})}>
              <SettingsOutlinedIcon />
            </IconButton>
          </Tooltip>
          <NoteNavButton />
        </Box>
      }
    />
  );

  const list = sidebarSection && (
    <PageList
      key={sidebarSection.id}
      pages={pagesInSection(pages, sidebarSection.id, showArchived)}
      sections={sections}
      sectionId={sidebarSection.id}
      activePageId={pageId}
      canEdit={canEdit}
      showArchived={showArchived}
      archivedCount={pages.filter((p) => p.section_id === sidebarSection.id && p.archived).length}
      onShowArchived={setShowArchived}
      reordering={actions.movePage.isPending}
      onOpen={openPage}
      onFavorite={(p) => actions.favoritePage.mutate({ id: p.id, favorite: !p.favorite }, { onError: fail })}
      onReorder={(id, position) => actions.movePage.mutate({ id, ...position }, { onError: fail })}
      onMoveToSection={(p, sectionId) =>
        actions.movePage.mutate({ id: p.id, section_id: sectionId }, { onError: fail })
      }
      onDelete={(p) => void deletePage(p)}
    />
  );

  const sidebarHeader = sidebarSection && (
    <Box sx={{ flexShrink: 0 }}>
      <Box sx={{ px: 1.5, py: 0.5, bgcolor: "action.hover", borderBottom: 1, borderColor: "divider" }}>
        <Button
          fullWidth
          color="inherit"
          aria-label="Back to sections"
          startIcon={<ArrowBackIcon />}
          onClick={showSections}
          sx={{ justifyContent: "flex-start", minHeight: 44, px: 1, textTransform: "none" }}
        >
          Back
        </Button>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 48, pl: 2.5, pr: 1.5, pt: 1 }}>
        <Typography variant="subtitle1" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
          {sidebarSection.name}
        </Typography>
        {canEdit && (
          <SectionOptions
            key={sidebarSection.id}
            section={sidebarSection}
            onRename={() => setSectionDialog({ section: sidebarSection })}
            onColor={(color) => actions.updateSection.mutate({ id: sidebarSection.id, color }, { onError: fail })}
            onDelete={() => void deleteSection(sidebarSection)}
          />
        )}
      </Box>
    </Box>
  );

  // Above the list: search, and the notebook's tags. A search shows its results in place of the list.
  const listColumn = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SearchBox value={query} onChange={setQuery} />
        </Box>
        <TagsMenu tags={tagCounts} onOpen={openTag} />
      </Box>
      {query.trim() ? (
        <SearchResults
          query={query}
          notebookId={notebookId}
          onOpen={(hit) => {
            setQuery("");
            if (hit.in_notebook && hit.notebook_id === notebookId) openPage(hit.id);
            else navigate(hit.in_notebook ? `${BOARD}/b/${hit.notebook_id}/p/${hit.id}` : `${BOARD}/p/${hit.id}`);
          }}
        />
      ) : sidebarSection ? (
        <>
          {sidebarSection.kind === "journal" && (canEdit || pages.some((p) => p.journal_date === today)) && (
            <Button startIcon={<TodayOutlinedIcon />} onClick={() => void openToday()} disabled={toolBusy}>
              Today's page
            </Button>
          )}
          {canEdit && sidebarSection.kind === "normal" && !!templates.length && (
            <Button onClick={() => setTemplateDialog("create")}>From template</Button>
          )}
          {list}
        </>
      ) : sections.length > 0 ? (
        <SectionList
          key={notebookId}
          sections={sections}
          activeId={navigationSection?.id ?? null}
          onSelect={showSectionPages}
          canEdit={canEdit}
          onAdd={() => setSectionDialog({ section: null })}
          onReorder={(id, position) => actions.moveSection.mutate({ id, ...position }, { onError: fail })}
          reordering={actions.moveSection.isPending}
        />
      ) : null}
    </Box>
  );

  const toolPane =
    activeTool === "tasks" ? (
      <TasksPane key={toolNotebookId ?? "global"} notebookId={toolNotebookId} />
    ) : activeTool === "graph" ? (
      <GraphPane key={toolNotebookId ?? "global"} notebookId={toolNotebookId} />
    ) : null;
  const detailOpen = !!pageId || !!tag || !!toolPane;
  const mainHeader = header && (wide || !detailOpen) && (
    <Box
      sx={{
        width: "100%",
        maxWidth: NOTEBOOK_CONTENT_WIDTH,
        mx: "auto",
        px: { xs: 1.5, sm: 3 },
        pt: { xs: 2, sm: 3 },
      }}
    >
      {header}
    </Box>
  );
  const showNotebook = !!notebook && !isPending && !loadingBooks && !isError;
  const noSections =
    sections.length === 0 ? (
      <EmptyState
        icon={<NotesIcon />}
        title="No sections yet"
        description="Add a section to organize your notebook pages."
        action={
          canEdit ? (
            <Button variant="contained" onClick={() => setSectionDialog({ section: null })}>
              Add a section
            </Button>
          ) : undefined
        }
      />
    ) : null;

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
  } else {
    const pane =
      toolPane ??
      noSections ??
      (tag ? (
        <Box>
          {!wide && (
            <Button sx={{ m: 1 }} onClick={closePage}>
              Back to the pages
            </Button>
          )}
          <TagPage
            notebookId={notebookId}
            tag={tag}
            pages={pages}
            sections={sections}
            onOpenPage={(id, nb, inNotebook) =>
              nb === notebookId ? openPage(id) : navigate(inNotebook ? `${BOARD}/b/${nb}/p/${id}` : `${BOARD}/p/${id}`)
            }
            onOpenTag={openTag}
          />
        </Box>
      ) : pageId ? (
        <PageView
          key={pageId}
          pageId={pageId}
          heading={pageHeading}
          onBack={wide ? undefined : closePage}
          onGone={closePage}
          links={links}
        />
      ) : wide ? (
        <EmptyState
          icon={<NotesIcon />}
          title={
            !sidebarSection
              ? "Pick a section"
              : pages.some((page) => page.section_id === sidebarSection.id)
                ? "Pick a page"
                : "No pages yet"
          }
          description={sidebarSection && canEdit ? "Open a page from the list, or start a new one." : undefined}
        />
      ) : null);

    body = (
      <Box
        sx={{
          display: { xs: "flex", md: "grid" },
          flexDirection: "column",
          gridTemplateColumns: `${PAGES_SIDEBAR_WIDTH}px minmax(0, 1fr)`,
          gridTemplateRows: "minmax(0, 1fr)",
          flex: 1,
          minHeight: 0,
        }}
      >
        {wide && (
          <Box
            component="aside"
            aria-label="Notebook pages"
            sx={{
              gridArea: "1 / 1",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              borderRight: 1,
              borderColor: "divider",
            }}
          >
            {sidebarHeader}
            <Box
              key={sidebarSection?.id ?? "sections"}
              data-list-drag-scroll
              sx={{ flex: 1, minHeight: 0, p: 1.5, overflowY: "auto" }}
            >
              {listColumn}
            </Box>
          </Box>
        )}
        {/* On a phone an open page takes the whole screen, with its own way back. */}
        {!wide && !detailOpen && mainHeader}
        {wide ? (
          <Box
            sx={{
              gridArea: "1 / 2",
              display: "flex",
              flexDirection: "column",
              width: "100%",
              minHeight: 0,
              mx: "auto",
              ...(pageHeading && {
                maxWidth: NOTEBOOK_CONTENT_WIDTH,
                borderInline: "1px solid",
                borderColor: "divider",
              }),
            }}
          >
            <Box sx={{ flexShrink: 0 }}>{mainHeader}</Box>
            <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
              <Box
                component="section"
                aria-label="Notebook content"
                key={`${notebookId}:${activeTool ?? ""}:${pageId ?? ""}:${tag ?? ""}`}
                sx={{ flex: 1, minWidth: 0, overflowY: "auto" }}
              >
                <Box sx={{ maxWidth: 960, mx: "auto" }}>{pane}</Box>
              </Box>
              {beside && !toolPane && (
                <Box
                  aria-label="Page open beside"
                  role="complementary"
                  sx={{
                    flex: "0 0 min(480px, 50%)",
                    borderLeft: 1,
                    borderColor: "divider",
                    minWidth: 0,
                    overflowY: "auto",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 1.5,
                      py: 0.5,
                      borderBottom: 1,
                      borderColor: "divider",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      Opened beside
                    </Typography>
                    <Tooltip title="Open it full size">
                      <IconButton
                        size="small"
                        aria-label="Open full size"
                        onClick={() => navigate(`${BOARD}/b/${notebookId}/p/${beside}`)}
                      >
                        <OpenInFullIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Close">
                      <IconButton size="small" aria-label="Close the page beside" onClick={() => openBeside(null)}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <PageView key={beside} pageId={beside} onGone={() => openBeside(null)} links={links} />
                </Box>
              )}
            </Box>
          </Box>
        ) : detailOpen || noSections ? (
          pane
        ) : (
          <>
            {sidebarHeader}
            <Box sx={{ p: 1.5 }}>{listColumn}</Box>
          </>
        )}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", height: { md: "calc(100dvh - 64px)" } }}>
        {!showNotebook && mainHeader}
        {body}
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
      {templateDialog && (
        <ResponsiveDialog
          open
          onClose={() => setTemplateDialog(null)}
          title={templateDialog === "journal" ? "Journal template" : "Choose a template"}
          actions={<Button onClick={() => setTemplateDialog(null)}>Close</Button>}
        >
          <List>
            {templateDialog === "journal" && (
              <ListItemButton
                disabled={toolBusy}
                selected={!notebook?.journal_template_id}
                onClick={() => void applyTemplate(null)}
              >
                <ListItemText primary="Blank page" />
              </ListItemButton>
            )}
            {templates.map((item) => (
              <ListItemButton
                key={item.id}
                disabled={toolBusy}
                selected={templateDialog === "journal" && notebook?.journal_template_id === item.id}
                onClick={() => void applyTemplate(item.id)}
              >
                <ListItemText primary={pageTitle(item.title)} />
              </ListItemButton>
            ))}
          </List>
        </ResponsiveDialog>
      )}
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
