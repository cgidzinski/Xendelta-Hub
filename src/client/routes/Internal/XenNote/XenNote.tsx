import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Card,
  Chip,
  Drawer,
  IconButton,
  InputAdornment,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LinkIcon from "@mui/icons-material/Link";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import NotesIcon from "@mui/icons-material/Notes";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import AddIcon from "@mui/icons-material/Add";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import PublicIcon from "@mui/icons-material/Public";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";
import { useSnackbar } from "notistack";
import { api } from "../../../config/api";
import { useAuth } from "../../../contexts/AuthContext";
import { isNetworkError } from "../../../offline/offlineQueue";
import { offlineQueue } from "../../../offline/offlineRuntime";
import type { NoteType } from "@shared/xennote/notes";
import { matchesKind, type NoteKind } from "./noteDraft";
import { railPanelSx } from "../../../components/ui/railStyles";
import { sectionLabelSx } from "../../../components/ui/surfaceStyles";
import { swatchColor } from "./noteColors";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useTitle } from "../../../hooks/useTitle";
import { xennoteKeys } from "../../../hooks/xennote/keys";
import {
  useXenNoteActions,
  useXenNoteCounts,
  useXenNoteLabels,
  useXenNotebooks,
  useXenNotes,
} from "../../../hooks/xennote/useXenNote";
import type { NoteFilters, XenNote as Note } from "../../../types/XenNote";
import NoteCard from "./components/NoteCard";
import NoteEditor from "./components/NoteEditor";
import NoteRail, { type Scope } from "./components/NoteRail";
import NotebookDialog from "./components/NotebookDialog";

/** The type chips above the board narrow what is shown; "all" shows every type. */
type TypeFilter = NoteKind;
const TYPE_FILTERS: Array<{ id: TypeFilter; label: string; icon?: ReactElement }> = [
  { id: "all", label: "All" },
  { id: "lists", label: "Lists", icon: <CheckBoxOutlinedIcon /> },
  { id: "photos", label: "Photos", icon: <ImageOutlinedIcon /> },
  { id: "links", label: "Links", icon: <LinkIcon /> },
  { id: "notes", label: "Notes", icon: <NotesIcon /> },
];

const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

export default function XenNote() {
  useTitle("XenNote");
  const { enqueueSnackbar } = useSnackbar();
  const { updateNote } = useXenNoteActions();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const phone = useMediaQuery(theme.breakpoints.down("sm"));

  const [scope, setScope] = useState<Scope>("all");
  const [label, setLabel] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const q = useDeferredValue(search);

  const [editor, setEditor] = useState<{ note: Note | null; startType?: NoteType } | null>(null);
  const [notebookDialog, setNotebookDialog] = useState<{
    id: string | null;
    tab?: "general" | "people" | "link";
  } | null>(null);

  // A link to a note (a reminder's notification) opens it: /internal/xennote?note=<id>. The address is tidied once
  // the note has loaded, so closing it and reloading doesn't reopen it. `handled` stops a re-render from fetching twice,
  // and is cleared with the address so the same link works again later.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedNoteId = searchParams.get("note");
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedNoteId) {
      handled.current = null;
      return;
    }
    if (handled.current === linkedNoteId) return;
    handled.current = linkedNoteId;
    api
      .get<{ note: Note }>(`/api/xennote/notes/${encodeURIComponent(linkedNoteId)}`)
      .then((r) => setEditor({ note: r.note }))
      .catch(() => enqueueSnackbar("That note isn't available any more", { variant: "info" }))
      .finally(() => setSearchParams({}, { replace: true }));
  }, [linkedNoteId, setSearchParams, enqueueSnackbar]);

  const filters: NoteFilters = {
    notebook: scope === "all" || scope === "archive" ? undefined : scope,
    archived: scope === "archive",
    label: label ?? undefined,
    q,
  };
  const { data: allNotes, isLoading, isError, error, refetch } = useXenNotes(filters);
  const { data: notebooks = [] } = useXenNotebooks();
  const { data: labels = [] } = useXenNoteLabels();
  const { data: counts } = useXenNoteCounts();

  const notes = useMemo(
    () => (typeFilter === "all" ? allNotes : allNotes?.filter((n) => matchesKind(n, typeFilter))),
    [allNotes, typeFilter],
  );
  const openBook = notebooks.find((b) => b._id === scope) ?? null;
  const pinned = useMemo(() => (notes ?? []).filter((n) => n.pinned), [notes]);
  const others = useMemo(() => (notes ?? []).filter((n) => !n.pinned), [notes]);

  const save = (id: string, input: Parameters<typeof updateNote.mutate>[0]["input"]) =>
    updateNote.mutate(
      { id, input },
      { onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't save", { variant: "error" }) },
    );

  // Ticking a box shows at once and is saved as "this item is done/not done" (so it can't undo someone else's edit).
  // With no connection it is kept on the device and sent later; any other failure puts everything back.
  const toggleItem = async (note: Note, index: number) => {
    const item = note.checklist[index];
    const done = !item.done;
    const checklist = note.checklist.map((c, i) => (i === index ? { ...c, done } : c));
    queryClient.setQueriesData<Note[]>({ queryKey: xennoteKeys.notesAll() }, (old) =>
      old?.map((n) => (n._id === note._id ? { ...n, checklist } : n)),
    );
    if (!item._id) {
      updateNote.mutate(
        { id: note._id, input: { checklist } },
        { onError: () => queryClient.invalidateQueries({ queryKey: xennoteKeys.all }) },
      );
      return;
    }
    try {
      await api.put(`/api/xennote/notes/${note._id}/checklist/${item._id}`, { done });
    } catch (e) {
      if (userId && isNetworkError(e)) {
        await offlineQueue.add(
          userId,
          { kind: "note-tick", noteId: note._id, itemId: item._id, done },
          `${done ? "Tick" : "Untick"} “${item.text || "item"}”`,
        );
        return;
      }
      enqueueSnackbar((e as Error).message || "Couldn't save", { variant: "error" });
      void queryClient.invalidateQueries({ queryKey: xennoteKeys.all });
    }
  };

  const renderNotes = (list: Note[]) => (
    <Box sx={{ columnCount: { xs: 2, md: 2, lg: 3, xl: 4 }, columnGap: 2 }}>
      {list.map((n) => (
        <NoteCard
          key={n._id}
          note={n}
          onOpen={() => setEditor({ note: n })}
          onToggleItem={n.can_edit ? (i) => toggleItem(n, i) : undefined}
          onTogglePin={() => save(n._id, { pinned: !n.pinned })}
        />
      ))}
    </Box>
  );

  const startNote = (type?: NoteType) => setEditor({ note: null, startType: type });
  const empty = !!notes && notes.length === 0;
  const startNotebookId =
    openBook && (openBook.my_role === "owner" || openBook.my_role === "editor") ? openBook._id : null;
  const canWrite = scope !== "archive" && (!openBook || !!startNotebookId);

  const pickScope = (next: Scope) => {
    setScope(next);
    setTypeFilter("all");
    setRailOpen(false);
  };

  const rail = (
    <NoteRail
      scope={scope}
      onScope={pickScope}
      counts={counts}
      notebooks={notebooks}
      labels={labels}
      label={label}
      onLabel={(l) => {
        setLabel(l);
        setRailOpen(false);
      }}
      onNewNote={canWrite ? () => startNote() : undefined}
      onNewNotebook={() => {
        setRailOpen(false);
        setNotebookDialog({ id: null });
      }}
    />
  );

  const sectionHeader = (text: string, count: number, icon?: ReactNode) => (
    <Typography
      variant="caption"
      sx={{
        ...sectionLabelSx,
        display: "flex",
        alignItems: "center",
        gap: 1,
        mt: 0.75,
        mb: 1.5,
        color: "text.secondary",
      }}
    >
      {icon}
      {text} · {count}
    </Typography>
  );

  const typeCount = (type: TypeFilter) =>
    type === "all" ? (allNotes?.length ?? 0) : (allNotes?.filter((n) => matchesKind(n, type)).length ?? 0);

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

        <Box sx={{ flex: 1, minWidth: 0, px: { xs: 1.5, sm: 4 }, pt: { xs: 2, sm: 3 }, pb: { xs: 10, sm: 4 } }}>
          {!wide && (
            <PageHeader
              title={
                scope === "all"
                  ? "All notes"
                  : scope === "none"
                    ? "My notes"
                    : scope === "archive"
                      ? "Archive"
                      : (openBook?.name ?? "Notes")
              }
              actions={
                <IconButton aria-label="Open notebooks" onClick={() => setRailOpen(true)}>
                  <MenuBookOutlinedIcon />
                </IconButton>
              }
            />
          )}

          {openBook && (
            <Box
              aria-label="Notebook"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
                p: { xs: 1.5, sm: 2.5 },
                mb: 2.5,
                border: 1,
                borderColor: "divider",
                borderRadius: 3,
              }}
            >
              <Box
                sx={(t) => {
                  const main = swatchColor(t, openBook.color) ?? t.palette.text.secondary;
                  return {
                    width: 48,
                    height: 48,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: main,
                    bgcolor: alpha(main, 0.18),
                  };
                }}
              >
                <MenuBookOutlinedIcon />
              </Box>
              <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
                <Typography variant="h5" component="h1" noWrap sx={{ fontWeight: 500 }}>
                  {openBook.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {openBook.note_count} {openBook.note_count === 1 ? "note" : "notes"}
                  {openBook.my_role
                    ? ` · You're ${ROLE_LABEL[openBook.my_role].toLowerCase() === "owner" ? "the owner" : `a ${ROLE_LABEL[openBook.my_role].toLowerCase()}`}`
                    : ""}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 13 } }}>
                  {openBook.members.map((m) => (
                    <Avatar key={m.user_id} alt={m.username} src={m.avatar ?? undefined}>
                      {m.username.slice(0, 1).toUpperCase()}
                    </Avatar>
                  ))}
                </AvatarGroup>
                {openBook.share?.enabled && (
                  <Chip size="small" color="primary" variant="outlined" icon={<PublicIcon />} label="Link on" />
                )}
                {openBook.my_role === "owner" && (
                  <Button
                    variant="contained"
                    startIcon={<PersonAddAltOutlinedIcon />}
                    onClick={() => setNotebookDialog({ id: openBook._id, tab: "people" })}
                    sx={{ borderRadius: 6 }}
                  >
                    Share
                  </Button>
                )}
                <Tooltip title="Notebook settings">
                  <IconButton aria-label="Notebook settings" onClick={() => setNotebookDialog({ id: openBook._id })}>
                    <SettingsOutlinedIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          )}

          <TextField
            fullWidth
            placeholder="Search notes, lists and links"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                sx: { borderRadius: 3, height: 44 },
              },
            }}
            sx={{ maxWidth: 640, display: "flex", mx: "auto", mb: 2.25 }}
          />

          {canWrite && !phone && !openBook && (
            <Card
              variant="outlined"
              sx={{
                mb: 4,
                pl: 2.5,
                pr: 1.25,
                height: 54,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                maxWidth: 640,
                mx: "auto",
                borderRadius: 3,
                boxShadow: 2,
              }}
            >
              <Typography
                role="button"
                tabIndex={0}
                onClick={() => startNote()}
                onKeyDown={(e) => e.key === "Enter" && startNote()}
                color="text.secondary"
                sx={{ flex: 1, cursor: "text" }}
              >
                Take a note…
              </Typography>
              <Tooltip title="New note">
                <IconButton aria-label="New note" onClick={() => startNote("text")}>
                  <NotesIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="New list">
                <IconButton aria-label="New list" onClick={() => startNote("checklist")}>
                  <CheckBoxOutlinedIcon />
                </IconButton>
              </Tooltip>
            </Card>
          )}

          {openBook && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 2.75 }}>
              <Stack direction="row" sx={{ gap: 1, flex: 1, flexWrap: "wrap" }} aria-label="Filter by type">
                {TYPE_FILTERS.map((f) => (
                  <Chip
                    key={f.id}
                    icon={f.icon}
                    label={f.id === "all" ? f.label : `${f.label} · ${typeCount(f.id)}`}
                    color={typeFilter === f.id ? "primary" : "default"}
                    variant={typeFilter === f.id ? "filled" : "outlined"}
                    onClick={() => setTypeFilter(f.id)}
                  />
                ))}
              </Stack>
              {canWrite && !phone && (
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<AddIcon />}
                  onClick={() => startNote()}
                  sx={{ borderRadius: 6, height: 40 }}
                >
                  New note
                </Button>
              )}
            </Box>
          )}

          {isLoading && !notes ? (
            <ListSkeleton rows={4} height={96} gap={2} />
          ) : isError ? (
            <ErrorDisplay error={error ?? null} title="Couldn't load your notes" onRetry={() => refetch()} />
          ) : empty ? (
            <EmptyState
              icon={<StickyNote2OutlinedIcon />}
              title={
                scope === "archive"
                  ? "Nothing archived"
                  : search || label || typeFilter !== "all"
                    ? "No notes match"
                    : "No notes yet"
              }
              description={
                scope === "archive"
                  ? "Archived notes are kept here."
                  : "Take a note, make a list, save a photo or a link."
              }
            />
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  {sectionHeader("Pinned", pinned.length, <PushPinOutlinedIcon sx={{ fontSize: 15 }} />)}
                  {renderNotes(pinned)}
                  {others.length > 0 && <Box sx={{ mt: 2.75 }}>{sectionHeader("Others", others.length)}</Box>}
                </>
              )}
              {others.length > 0 && renderNotes(others)}
            </>
          )}
        </Box>
      </Box>

      {canWrite && phone && (
        <SpeedDial ariaLabel="Add a note" icon={<SpeedDialIcon />} sx={{ position: "fixed", right: 16, bottom: 16 }}>
          <SpeedDialAction
            icon={<NotesIcon />}
            slotProps={{ tooltip: { open: true, title: "Note" } }}
            onClick={() => startNote("text")}
          />
          <SpeedDialAction
            icon={<CheckBoxOutlinedIcon />}
            slotProps={{ tooltip: { open: true, title: "List" } }}
            onClick={() => startNote("checklist")}
          />
        </SpeedDial>
      )}

      <NoteEditor
        open={!!editor}
        onClose={() => setEditor(null)}
        note={editor?.note ?? null}
        startType={editor?.startType}
        startNotebookId={startNotebookId}
        notebooks={notebooks}
        labelSuggestions={labels.map((l) => l.name)}
      />
      <NotebookDialog
        open={!!notebookDialog}
        onClose={() => setNotebookDialog(null)}
        notebook={notebooks.find((b) => b._id === notebookDialog?.id) ?? null}
        initialTab={notebookDialog?.tab}
        onGone={() => setScope("all")}
      />
    </>
  );
}
