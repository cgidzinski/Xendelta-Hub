import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import ChecklistIcon from "@mui/icons-material/Checklist";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import SearchIcon from "@mui/icons-material/Search";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";
import { closeSnackbar, useSnackbar } from "notistack";
import type { NoteType } from "@shared/xennote/notes";
import { normalizeTitle } from "@shared/xennote/wikiLinks";
import { sectionLabelSx } from "../../../components/ui/surfaceStyles";
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
  useXenNoteLabels,
  useXenNoteTrashActions,
  useXenNotes,
} from "../../../hooks/xennote/useXenNote";
import type { NoteFilters, XenNote as Note } from "../../../types/XenNote";
import { NOTE_SORTS, isNoteSort, sortNotes, type NoteSort } from "./noteSort";
import NoteCard from "./components/NoteCard";
import NoteEditor from "./components/NoteEditor";
import NoteTrash from "./components/NoteTrash";
import NoteBulkBar from "./components/NoteBulkBar";
import NoteNavButton from "./components/NoteNavButton";

export default function XenNote() {
  useTitle("XenNote");
  const { enqueueSnackbar } = useSnackbar();
  const { updateNote, deleteNote, bulkUpdateNotes, bulkDeleteNotes } = useXenNoteActions();
  const { restore } = useXenNoteTrashActions();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedScope = searchParams.get("scope");
  const scope = requestedScope === "archive" || requestedScope === "trash" ? requestedScope : "loose";
  const sharedOnly = scope === "loose" && searchParams.get("ownership") === "shared";
  const label = searchParams.get("label");
  const search = searchParams.get("q") ?? "";
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const [sort, setSort] = useLocalStorageState<NoteSort>("xennote_sort", "edited", isNoteSort);
  // Choosing several notes to change or trash together.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const q = useDeferredValue(search);

  const [editor, setEditor] = useState<{ note: Note | null; startType?: NoteType } | null>(null);

  // Consume a linked note while keeping board filters in the URL for Back navigation.
  const linkedNoteId = searchParams.get("note");
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedNoteId) {
      handled.current = null;
      return;
    }
    if (handled.current === linkedNoteId) return;
    handled.current = linkedNoteId;
    const openLinkedNote = async () => {
      try {
        const id = encodeURIComponent(linkedNoteId);
        setEditor({ note: (await api.get<{ note: Note }>(`/api/xennote/notes/${id}`)).note });
      } catch {
        enqueueSnackbar("That note isn't available any more", { variant: "info" });
      }
    };
    void openLinkedNote();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("note");
        return next;
      },
      { replace: true },
    );
  }, [linkedNoteId, setSearchParams, enqueueSnackbar]);

  const filters: NoteFilters = {
    scope: sharedOnly ? "shared" : undefined,
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
  const { data: labels = [] } = useXenNoteLabels();

  const notes = useMemo(() => allNotes && sortNotes(allNotes, sort), [allNotes, sort]);
  // What is ticked belongs to the view it was ticked in; a new view, search or filter starts again.
  const viewKey = `${scope}|${sharedOnly}|${label ?? ""}|${q}`;
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
      setEditor((current) => (current?.note?._id === note._id ? null : current));
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
    <Box sx={{ columnWidth: 220, columnCount: 4, columnGap: 2 }}>
      {list.map((n) => (
        <NoteCard
          key={n._id}
          note={n}
          onOpen={() => setEditor({ note: n })}
          onToggleItem={n.can_edit ? (i) => toggleItem(n, i) : undefined}
          onTogglePin={() => save(n._id, { pinned: !n.pinned })}
          resolveTitle={resolveTitle}
          onOpenLinked={openNoteById}
          selected={selecting ? selectedIds.includes(n._id) : undefined}
          onSelect={() => toggleSelected(n._id)}
        />
      ))}
    </Box>
  );

  const scopeTitle = scope === "loose" ? "Loose notes" : scope === "archive" ? "Archive" : "Trash";
  const startNote = (type?: NoteType) => setEditor({ note: null, startType: type });
  const empty = !!notes && notes.length === 0;
  const canWrite = scope === "loose" && !sharedOnly;
  const hasLabelFilter = labels.length > 0 || !!label;

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

  return (
    <>
      <Box
        sx={{
          maxWidth: 1200,
          mx: "auto",
          px: { xs: 1.5, sm: 4 },
          pt: { xs: 2, sm: 3 },
          pb: 4,
        }}
      >
        <PageHeader
          title={scopeTitle}
          mb={2.5}
          actions={
            <>
              {canWrite && (
                <>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => startNote("text")}>
                    New note
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<CheckBoxOutlinedIcon />}
                    onClick={() => startNote("checklist")}
                  >
                    New list
                  </Button>
                </>
              )}
              <NoteNavButton />
            </>
          }
        />

        {scope === "trash" && <NoteTrash />}

        {scope !== "trash" && (
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              placeholder="Search notes, lists and links"
              value={search}
              onChange={(e) => setFilter("q", e.target.value)}
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

        {(scope === "loose" || (scope === "archive" && hasLabelFilter)) && (
          <Stack direction="row" sx={{ gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2.75 }}>
            {scope === "loose" && (
              <FormControlLabel
                label="Shared with me"
                control={
                  <Switch
                    checked={sharedOnly}
                    onChange={(_, checked) => setFilter("ownership", checked ? "shared" : "")}
                    slotProps={{ input: { role: "switch" } }}
                  />
                }
                sx={{ m: 0 }}
              />
            )}
            {hasLabelFilter && (
              <TextField
                select
                id="xennote-label"
                label="Label"
                size="small"
                value={label ?? ""}
                onChange={(e) => setFilter("label", e.target.value)}
                sx={{ minWidth: 128, maxWidth: 220 }}
              >
                <MenuItem value="">Any label</MenuItem>
                {label && !labels.some(({ name }) => name === label) && <MenuItem value={label}>{label}</MenuItem>}
                {labels.map(({ name }) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        )}

        {selecting && scope !== "trash" && (
          <NoteBulkBar
            count={selectedIds.length}
            inArchive={scope === "archive"}
            busy={bulkUpdateNotes.isPending || bulkDeleteNotes.isPending}
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
                : search || label
                  ? "No notes match"
                  : sharedOnly
                    ? "No shared notes yet"
                    : "No notes yet"
            }
            description={
              scope === "archive"
                ? "Archived notes are kept here."
                : sharedOnly
                  ? "Loose notes people share with you will appear here."
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
      <NoteEditor
        open={!!editor}
        onClose={() => setEditor(null)}
        note={editor?.note ?? null}
        startType={editor?.startType}
        labelSuggestions={labels.map((l) => l.name)}
        titles={titles}
        onOpenNote={openNoteById}
        onDelete={removeNote}
      />
    </>
  );
}
