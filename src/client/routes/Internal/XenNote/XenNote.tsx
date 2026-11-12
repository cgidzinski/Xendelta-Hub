import { useDeferredValue, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LinkIcon from "@mui/icons-material/Link";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";
import { useSnackbar } from "notistack";
import type { NoteType } from "@shared/xennote/notes";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useTitle } from "../../../hooks/useTitle";
import { xennoteKeys } from "../../../hooks/xennote/keys";
import { useXenNoteActions, useXenNoteLabels, useXenNotebooks, useXenNotes } from "../../../hooks/xennote/useXenNote";
import type { NoteFilters, XenNote as Note } from "../../../types/XenNote";
import NoteCard from "./components/NoteCard";
import NoteEditor from "./components/NoteEditor";
import NotebookDialog from "./components/NotebookDialog";

/** Which notes are showing: everything, my private notes, one notebook, or the archive. */
type Scope = "all" | "none" | "archive" | string;

export default function XenNote() {
  useTitle("XenNote");
  const { enqueueSnackbar } = useSnackbar();
  const { updateNote } = useXenNoteActions();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<Scope>("all");
  const [label, setLabel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);

  const [editor, setEditor] = useState<{ note: Note | null; startType?: NoteType } | null>(null);
  const [notebookDialog, setNotebookDialog] = useState<{ id: string | null } | null>(null);

  const filters: NoteFilters = {
    notebook: scope === "all" || scope === "archive" ? undefined : scope,
    archived: scope === "archive",
    label: label ?? undefined,
    q,
  };
  const { data: notes, isLoading, isError, error, refetch } = useXenNotes(filters);
  const { data: notebooks = [] } = useXenNotebooks();
  const { data: labels = [] } = useXenNoteLabels();

  const openBook = notebooks.find((b) => b._id === scope) ?? null;
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

  const renderNotes = (list: Note[]) => (
    <Box sx={{ columnCount: { xs: 1, sm: 2, md: 3, lg: 4 }, columnGap: 2 }}>
      {list.map((n) => (
        <NoteCard
          key={n._id}
          note={n}
          onOpen={() => setEditor({ note: n })}
          onToggleItem={n.can_edit ? (i) => toggleItem(n, i) : undefined}
          onTogglePin={() => save(n._id, { pinned: !n.pinned })}
          onToggleArchive={() => save(n._id, { archived: !n.archived })}
        />
      ))}
    </Box>
  );

  const startNote = (type?: NoteType) => setEditor({ note: null, startType: type });
  const empty = !!notes && notes.length === 0;
  const startNotebookId =
    openBook && (openBook.my_role === "owner" || openBook.my_role === "editor") ? openBook._id : null;

  return (
    <PageContainer width="wide">
      <PageHeader
        title="XenNote"
        actions={
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNotebookDialog({ id: null })}>
            New notebook
          </Button>
        }
      />

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mb: 1.5, alignItems: "center" }}>
        <Chip
          label="All"
          color={scope === "all" ? "primary" : "default"}
          variant={scope === "all" ? "filled" : "outlined"}
          onClick={() => setScope("all")}
        />
        <Chip
          label="My notes"
          color={scope === "none" ? "primary" : "default"}
          variant={scope === "none" ? "filled" : "outlined"}
          onClick={() => setScope("none")}
        />
        {notebooks.map((b) => (
          <Chip
            key={b._id}
            label={`${b.name} · ${b.note_count}`}
            color={scope === b._id ? "primary" : "default"}
            variant={scope === b._id ? "filled" : "outlined"}
            onClick={() => setScope(b._id)}
          />
        ))}
        <Chip
          label="Archive"
          color={scope === "archive" ? "primary" : "default"}
          variant={scope === "archive" ? "filled" : "outlined"}
          onClick={() => setScope("archive")}
        />
        {openBook && (
          <Tooltip title="Notebook settings">
            <IconButton aria-label="Notebook settings" onClick={() => setNotebookDialog({ id: openBook._id })}>
              <SettingsOutlinedIcon />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {labels.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mb: 2 }}>
          {labels.map((l) => (
            <Chip
              key={l.name}
              size="small"
              label={l.name}
              variant={label?.toLowerCase() === l.name.toLowerCase() ? "filled" : "outlined"}
              color={label?.toLowerCase() === l.name.toLowerCase() ? "primary" : "default"}
              onClick={() => setLabel(label?.toLowerCase() === l.name.toLowerCase() ? null : l.name)}
            />
          ))}
        </Stack>
      )}

      <TextField
        fullWidth
        placeholder="Search notes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 2 }}
      />

      {scope !== "archive" && (
        <Card
          variant="outlined"
          sx={{ mb: 3, p: 1.5, display: "flex", alignItems: "center", gap: 1, maxWidth: 560, mx: "auto" }}
        >
          <Typography
            role="button"
            tabIndex={0}
            onClick={() => startNote()}
            onKeyDown={(e) => e.key === "Enter" && startNote()}
            color="text.secondary"
            sx={{ flex: 1, cursor: "text", px: 1 }}
          >
            Take a note…
          </Typography>
          <Tooltip title="New list">
            <IconButton aria-label="New list" onClick={() => startNote("checklist")}>
              <CheckBoxOutlinedIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="New note with photos">
            <IconButton aria-label="New note with photos" onClick={() => startNote("image")}>
              <ImageOutlinedIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="New link">
            <IconButton aria-label="New link" onClick={() => startNote("link")}>
              <LinkIcon />
            </IconButton>
          </Tooltip>
        </Card>
      )}

      {isLoading && !notes ? (
        <ListSkeleton rows={4} height={96} gap={2} />
      ) : isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load your notes" onRetry={() => refetch()} />
      ) : empty ? (
        <EmptyState
          icon={<StickyNote2OutlinedIcon />}
          title={scope === "archive" ? "Nothing archived" : search || label ? "No notes match" : "No notes yet"}
          description={
            scope === "archive" ? "Archived notes are kept here." : "Take a note, make a list, save a photo or a link."
          }
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <Typography variant="overline" color="text.secondary">
                Pinned
              </Typography>
              {renderNotes(pinned)}
              {others.length > 0 && (
                <Typography variant="overline" color="text.secondary">
                  Others
                </Typography>
              )}
            </>
          )}
          {others.length > 0 && renderNotes(others)}
        </>
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
        onGone={() => setScope("all")}
      />
    </PageContainer>
  );
}
