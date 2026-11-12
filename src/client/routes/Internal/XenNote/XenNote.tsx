import { useDeferredValue, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  AvatarGroup,
  Box,
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
import { useTheme } from "@mui/material/styles";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LinkIcon from "@mui/icons-material/Link";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import NotesIcon from "@mui/icons-material/Notes";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import PublicIcon from "@mui/icons-material/Public";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";
import { useSnackbar } from "notistack";
import type { NoteColor, NoteType } from "@shared/xennote/notes";
import PageContainer from "../../../components/ui/PageContainer";
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
type TypeFilter = "all" | NoteType;
const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "text", label: "Notes" },
  { id: "checklist", label: "Lists" },
  { id: "image", label: "Photos" },
  { id: "link", label: "Links" },
];

const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

export default function XenNote() {
  useTitle("XenNote");
  const { enqueueSnackbar } = useSnackbar();
  const { updateNote } = useXenNoteActions();
  const queryClient = useQueryClient();
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
    () => (typeFilter === "all" ? allNotes : allNotes?.filter((n) => n.type === typeFilter)),
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
    <Box sx={{ columnCount: { xs: 2, md: 2, lg: 3, xl: 4 }, columnGap: 2 }}>
      {list.map((n) => (
        <NoteCard
          key={n._id}
          note={n}
          onOpen={() => setEditor({ note: n })}
          onToggleItem={n.can_edit ? (i) => toggleItem(n, i) : undefined}
          onTogglePin={() => save(n._id, { pinned: !n.pinned })}
          onToggleArchive={() => save(n._id, { archived: !n.archived })}
          onColor={(color: NoteColor) => save(n._id, { color })}
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
      onNewNotebook={() => {
        setRailOpen(false);
        setNotebookDialog({ id: null });
      }}
    />
  );

  const title =
    scope === "all"
      ? "All notes"
      : scope === "none"
        ? "My notes"
        : scope === "archive"
          ? "Archive"
          : (openBook?.name ?? "Notes");

  return (
    <PageContainer width="wide">
      <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
        {wide ? (
          <Box sx={{ width: 240, flex: "none", position: "sticky", top: 16 }}>{rail}</Box>
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
          <PageHeader
            title={title}
            onBack={undefined}
            actions={
              !wide ? (
                <IconButton aria-label="Open notebooks" onClick={() => setRailOpen(true)}>
                  <MenuBookOutlinedIcon />
                </IconButton>
              ) : undefined
            }
          />

          {openBook && (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, mb: 2 }}
              aria-label="Notebook"
            >
              <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 13 } }}>
                {openBook.members.map((m) => (
                  <Avatar key={m.user_id} alt={m.username} src={m.avatar ?? undefined}>
                    {m.username.slice(0, 1).toUpperCase()}
                  </Avatar>
                ))}
              </AvatarGroup>
              {openBook.my_role && <Chip size="small" variant="outlined" label={ROLE_LABEL[openBook.my_role]} />}
              {openBook.share?.enabled && (
                <Chip size="small" color="primary" variant="outlined" icon={<PublicIcon />} label="Link on" />
              )}
              <Box sx={{ flex: 1 }} />
              {openBook.my_role === "owner" && (
                <Chip
                  clickable
                  icon={<PersonAddAltOutlinedIcon />}
                  label="Share"
                  onClick={() => setNotebookDialog({ id: openBook._id, tab: "people" })}
                />
              )}
              <Tooltip title="Notebook settings">
                <IconButton aria-label="Notebook settings" onClick={() => setNotebookDialog({ id: openBook._id })}>
                  <SettingsOutlinedIcon />
                </IconButton>
              </Tooltip>
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

          {canWrite && !phone && (
            <Card
              variant="outlined"
              sx={{ mb: 3, p: 1.5, display: "flex", alignItems: "center", gap: 1, maxWidth: 640, mx: "auto" }}
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

          <Stack direction="row" sx={{ gap: 1, mb: 2, overflowX: "auto", pb: 0.5 }} aria-label="Filter by type">
            {TYPE_FILTERS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                color={typeFilter === f.id ? "primary" : "default"}
                variant={typeFilter === f.id ? "filled" : "outlined"}
                onClick={() => setTypeFilter(f.id)}
              />
            ))}
          </Stack>

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
          <SpeedDialAction
            icon={<ImageOutlinedIcon />}
            slotProps={{ tooltip: { open: true, title: "Photos" } }}
            onClick={() => startNote("image")}
          />
          <SpeedDialAction
            icon={<LinkIcon />}
            slotProps={{ tooltip: { open: true, title: "Link" } }}
            onClick={() => startNote("link")}
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
    </PageContainer>
  );
}
