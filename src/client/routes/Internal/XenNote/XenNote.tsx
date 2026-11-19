import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import UserAvatar from "../../../components/user/UserAvatar";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AvatarGroup,
  Box,
  Button,
  Card,
  Chip,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
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
import ChecklistIcon from "@mui/icons-material/Checklist";
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
import { closeSnackbar, useSnackbar } from "notistack";
import type { NoteType } from "@shared/xennote/notes";
import { normalizeTitle } from "@shared/xennote/wikiLinks";
import { matchesKind, type NoteKind } from "./noteDraft";
import { railPanelSx } from "../../../components/ui/railStyles";
import { sectionLabelSx } from "../../../components/ui/surfaceStyles";
import { swatchColor } from "./noteColors";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { api } from "../../../config/api";
import { useTitle } from "../../../hooks/useTitle";
import { useLocalStorageState } from "../../../hooks/useLocalStorageState";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { xennoteKeys } from "../../../hooks/xennote/keys";
import {
  useXenNoteActions,
  useXenNoteCounts,
  useXenNoteLabels,
  useXenNotebooks,
  useXenNoteTrashActions,
  useXenNotes,
} from "../../../hooks/xennote/useXenNote";
import type { NoteFilters, XenNote as Note } from "../../../types/XenNote";
import { NOTE_SORTS, isNoteSort, sortNotes, type NoteSort } from "./noteSort";
import NoteCard from "./components/NoteCard";
import NoteEditor from "./components/NoteEditor";
import NoteTrash from "./components/NoteTrash";
import NoteBulkBar from "./components/NoteBulkBar";
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
  const { updateNote, deleteNote, bulkUpdateNotes, bulkDeleteNotes } = useXenNoteActions();
  const { restore } = useXenNoteTrashActions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const phone = useMediaQuery(theme.breakpoints.down("sm"));

  const [scope, setScope] = useState<Scope>("all");
  const [label, setLabel] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useLocalStorageState<NoteSort>("xennote_sort", "edited", isNoteSort);
  const [railOpen, setRailOpen] = useState(false);
  // Choosing several notes to change or trash together.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  // A link to a notebook (being added to one, or opening its public link as a member): /internal/xennote?notebook=<id>.
  const linkedBookId = searchParams.get("notebook");
  useEffect(() => {
    if (!linkedBookId) return;
    setScope(linkedBookId);
    setSearchParams(
      (p) => {
        p.delete("notebook");
        return p;
      },
      { replace: true },
    );
  }, [linkedBookId, setSearchParams]);

  const filters: NoteFilters = {
    notebook: scope === "all" || scope === "archive" || scope === "trash" ? undefined : scope,
    archived: scope === "archive",
    label: label ?? undefined,
    q,
  };
  const { data: allNotes, isLoading, isError, error, refetch } = useXenNotes(filters);
  // Every note the person can see (not just what the board is filtered to): what a [[title]] is looked up in.
  const { data: everyNote } = useXenNotes({});
  const titles = useMemo(
    () => (everyNote ?? []).filter((n) => n.title.trim()).map((n) => ({ _id: n._id, title: n.title.trim() })),
    [everyNote],
  );
  // A title means the most recently changed note called that (the list is newest first), ignoring case and extra spaces.
  const resolveTitle = useMemo(() => {
    const byTitle = new Map<string, string>();
    for (const t of titles) if (!byTitle.has(normalizeTitle(t.title))) byTitle.set(normalizeTitle(t.title), t._id);
    return (title: string) => byTitle.get(normalizeTitle(title)) ?? null;
  }, [titles]);
  const openNoteById = (id: string) => {
    const found = everyNote?.find((n) => n._id === id);
    if (found) setEditor({ note: found });
    else enqueueSnackbar("That note isn't available", { variant: "info" });
  };
  const { data: notebooks = [] } = useXenNotebooks();
  const { data: labels = [] } = useXenNoteLabels();
  const { data: counts } = useXenNoteCounts();

  const notes = useMemo(() => {
    const shown = typeFilter === "all" ? allNotes : allNotes?.filter((n) => matchesKind(n, typeFilter));
    return shown && sortNotes(shown, sort);
  }, [allNotes, typeFilter, sort]);
  const openBook = notebooks.find((b) => b._id === scope) ?? null;
  // What is ticked belongs to the view it was ticked in; a new view, search or filter starts again.
  const viewKey = `${scope}|${label ?? ""}|${typeFilter}|${q}`;
  useEffect(() => setSelectedIds([]), [viewKey]);
  const stopSelecting = () => {
    setSelecting(false);
    setSelectedIds([]);
  };
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const editableShown = (notes ?? []).filter((n) => n.can_edit);
  const countLabel = `${selectedIds.length} ${selectedIds.length === 1 ? "note" : "notes"}`;
  const bulk = async (run: () => Promise<{ updated?: number; deleted?: number; skipped: number }>, done: string) => {
    try {
      const r = await run();
      const skipped = r.skipped > 0 ? ` (${r.skipped} you can't edit left alone)` : "";
      enqueueSnackbar(`${done}${skipped}`, { variant: "success" });
      setSelectedIds([]);
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't change those notes", { variant: "error" });
    }
  };
  const bulkDelete = async () => {
    const ok = await confirm({
      title: `Move ${countLabel} to the Trash?`,
      message: "They disappear for everyone who can see them. You can bring them back from the Trash for 30 days.",
      confirmLabel: "Move to Trash",
    });
    if (ok) await bulk(() => bulkDeleteNotes.mutateAsync(selectedIds), `${countLabel} moved to Trash`);
  };
  const pinned = useMemo(() => (notes ?? []).filter((n) => n.pinned), [notes]);
  const others = useMemo(() => (notes ?? []).filter((n) => !n.pinned), [notes]);

  const save = (id: string, input: Parameters<typeof updateNote.mutate>[0]["input"]) =>
    updateNote.mutate(
      { id, input },
      { onError: (e: Error) => enqueueSnackbar(e.message || "Couldn't save", { variant: "error" }) },
    );

  // Ticking a box shows at once; the server catches up (and a failure puts everything back).
  const toggleItem = (note: Note, index: number) => {
    const checklist = note.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
    queryClient.setQueriesData<Note[]>({ queryKey: xennoteKeys.notesAll() }, (old) =>
      old?.map((n) => (n._id === note._id ? { ...n, checklist } : n)),
    );
    updateNote.mutate(
      { id: note._id, input: { checklist } },
      {
        onError: (e: Error) => {
          enqueueSnackbar(e.message || "Couldn't save", { variant: "error" });
          queryClient.invalidateQueries({ queryKey: xennoteKeys.all });
        },
      },
    );
  };

  const removeNote = async (note: Note) => {
    const ok = await confirm({
      title: "Move this note to the Trash?",
      message: "It disappears for everyone who can see it. You can bring it back from the Trash for 30 days.",
      confirmLabel: "Move to Trash",
    });
    if (!ok) return;
    try {
      await deleteNote.mutateAsync(note._id);
      enqueueSnackbar("Note moved to Trash", {
        variant: "success",
        action: (key) => (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              closeSnackbar(key);
              restore.mutate(note._id, {
                onError: (e) =>
                  enqueueSnackbar((e as Error).message || "Couldn't restore the note", { variant: "error" }),
              });
            }}
          >
            Undo
          </Button>
        ),
      });
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't delete the note", { variant: "error" });
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
          onArchive={() => save(n._id, { archived: !n.archived })}
          onColor={(color) => save(n._id, { color })}
          onDelete={() => removeNote(n)}
          resolveTitle={resolveTitle}
          onOpenLinked={openNoteById}
          selected={selecting ? selectedIds.includes(n._id) : undefined}
          onSelect={() => toggleSelected(n._id)}
        />
      ))}
    </Box>
  );

  const startNote = (type?: NoteType) => setEditor({ note: null, startType: type });
  const empty = !!notes && notes.length === 0;
  const startNotebookId =
    openBook && (openBook.my_role === "owner" || openBook.my_role === "editor") ? openBook._id : null;
  const canWrite = scope !== "archive" && scope !== "trash" && (!openBook || !!startNotebookId);

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
                      : scope === "trash"
                        ? "Trash"
                        : (openBook?.name ?? "Notes")
              }
              actions={
                <IconButton aria-label="Open notebooks" onClick={() => setRailOpen(true)}>
                  <MenuBookOutlinedIcon />
                </IconButton>
              }
            />
          )}

          {scope === "trash" && <NoteTrash />}

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
                    <UserAvatar key={m.user_id} user={m}>
                      {m.username.slice(0, 1).toUpperCase()}
                    </UserAvatar>
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

          {scope !== "trash" && (
            <Box sx={{ display: "flex", gap: 1, maxWidth: 640, mx: "auto", mb: 2.25 }}>
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
                sx={{ flex: 1, minWidth: 0 }}
              />
              <TextField
                select
                value={sort}
                onChange={(e) => setSort(e.target.value as NoteSort)}
                aria-label="Sort notes"
                slotProps={{ input: { sx: { borderRadius: 3, height: 44 } } }}
                sx={{ width: { xs: 130, sm: 160 } }}
              >
                {NOTE_SORTS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </TextField>
              <Tooltip title={selecting ? "Stop selecting" : "Select notes to change together"}>
                <span>
                  <IconButton
                    aria-label="Select notes"
                    aria-pressed={selecting}
                    color={selecting ? "primary" : "default"}
                    disabled={!notes || notes.length === 0}
                    onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
                    sx={{ height: 44, width: 44 }}
                  >
                    <ChecklistIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          )}

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

          {selecting && scope !== "trash" && (
            <NoteBulkBar
              count={selectedIds.length}
              inArchive={scope === "archive"}
              busy={bulkUpdateNotes.isPending || bulkDeleteNotes.isPending}
              notebooks={notebooks.filter((b) => b.my_role === "owner" || b.my_role === "editor")}
              labels={labels.map((l) => l.name)}
              onSelectAll={() => setSelectedIds(editableShown.map((n) => n._id))}
              onArchive={(archived) =>
                bulk(
                  () => bulkUpdateNotes.mutateAsync({ ids: selectedIds, archived: !archived }),
                  `${countLabel} ${archived ? "unarchived" : "archived"}`,
                )
              }
              onColor={(color) =>
                bulk(() => bulkUpdateNotes.mutateAsync({ ids: selectedIds, color }), `${countLabel} recoloured`)
              }
              onAddLabel={(l) =>
                bulk(() => bulkUpdateNotes.mutateAsync({ ids: selectedIds, add_label: l }), `Labelled ${countLabel}`)
              }
              onMove={(notebookId) =>
                bulk(
                  () => bulkUpdateNotes.mutateAsync({ ids: selectedIds, notebook_id: notebookId }),
                  `Moved ${countLabel}`,
                )
              }
              onDelete={bulkDelete}
              onDone={stopSelecting}
            />
          )}

          {scope === "trash" ? null : isLoading && !notes ? (
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
        titles={titles}
        onOpenNote={openNoteById}
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
