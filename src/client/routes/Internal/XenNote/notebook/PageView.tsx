import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Box, Button, Chip, IconButton, InputBase, TextField, Tooltip, Typography } from "@mui/material";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../config/api";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import type { XenNotePageDetail } from "../../../../types/XenNotePage";
import NoteReminderMenu from "../components/NoteReminderMenu";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { closeSnackbar, useSnackbar } from "notistack";
import { MAX_PAGE_ALIASES, MAX_PAGE_TAGS, MAX_PAGE_TITLE, normalizeTag } from "@shared/xennote/pages";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import DetailSkeleton from "../../../../components/ui/DetailSkeleton";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useMarkSharedSeen } from "../../../../hooks/xennote/usePageSharing";
import { useNotebookPageActions, useXenNotePage } from "../../../../hooks/xennote/usePages";
import { useTitle } from "../../../../hooks/useTitle";
import type { DraftLabel } from "../editor/pageDraft";
import type { PageLinksValue } from "../editor/pageLinksContext";
import PageShareDialog from "./PageShareDialog";
import PageReferences from "./PageReferences";
import NoteColorPopover from "../components/NoteColorPopover";
import { pageTitle } from "./pageTree";

// The editor (and ProseMirror with it) is its own chunk, loaded when a page is opened.
const PageEditor = lazy(() => import("../editor/PageEditor"));

const TITLE_SAVE_DELAY_MS = 600;

/** The page's title, edited in place and saved a moment after typing stops (and straight away if the page is left). */
function TitleField({
  value,
  editable,
  onCommit,
}: {
  value: string;
  editable: boolean;
  onCommit: (title: string) => void;
}) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  // What the timers and the unmount below read, so they never use a stale title or callback.
  const latest = useRef({ text, onCommit });
  latest.current = { text, onCommit };
  // A rename from elsewhere replaces what is shown, unless the person is typing.
  useEffect(() => {
    if (value !== committed.current && text === committed.current) {
      committed.current = value;
      setText(value);
    }
    // `text` is deliberately not a dependency: this only reacts to the saved title changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    if (text === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = text;
      latest.current.onCommit(text);
    }, TITLE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  // Leaving the page with a title still waiting to be saved must not lose it.
  useEffect(
    () => () => {
      if (latest.current.text !== committed.current) latest.current.onCommit(latest.current.text);
    },
    [],
  );
  return (
    <InputBase
      fullWidth
      multiline
      value={text}
      readOnly={!editable}
      placeholder="Untitled"
      onChange={(e) => setText(e.target.value.replace(/\n/g, " "))}
      inputProps={{ "aria-label": "Page title", maxLength: MAX_PAGE_TITLE }}
      sx={{
        fontSize: { xs: "1.75rem", sm: "2.125rem" },
        fontWeight: 600,
        letterSpacing: "-0.01em",
        lineHeight: 1.25,
        py: 0.5,
      }}
    />
  );
}

interface PageViewProps {
  pageId: string;
  /** Shown on phones: back to the list of pages. */
  onBack?: () => void;
  /** The page was deleted, or can't be opened any more. */
  onGone: () => void;
  /** What links and tags in the text do, and where "linked from" opens a page. */
  links?: PageLinksValue;
}

/** One page: its title, tags, actions and text. */
export default function PageView({ pageId, onBack, onGone, links }: PageViewProps) {
  const { data, isPending, isError, error, refetch } = useXenNotePage(pageId);
  const page = data?.page;
  const actions = useNotebookPageActions(page?.notebook_id ?? "");
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const [reminderAnchor, setReminderAnchor] = useState<HTMLElement | null>(null);
  const queryClient = useQueryClient();
  const reminderAction = useMutation({
    mutationFn: (at: string | null) =>
      api.put<{ reminder: XenNotePageDetail["reminder"] }>(`/api/xennote/pages/${pageId}/reminder`, { at }),
    onSuccess: ({ reminder }) => {
      queryClient.setQueryData<XenNotePageDetail>(
        xennoteKeys.page(pageId),
        (current) => current && { ...current, reminder },
      );
    },
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [label, setLabel] = useState<DraftLabel>("Saved");
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [tag, setTag] = useState("");
  const [alias, setAlias] = useState("");
  useMarkSharedSeen("page", data && !data.notebook ? page?.id : undefined, data?.viewed_at);
  useTitle(page ? pageTitle(page.title) : "XenNote");

  const fail = (e: unknown) => enqueueSnackbar((e as Error).message || "Couldn't save that", { variant: "error" });

  if (isPending) return <DetailSkeleton height={360} />;
  if (isError || !data || !page) {
    return <ErrorDisplay error={error ?? null} title="Couldn't open this page" onRetry={() => refetch()} />;
  }

  const addTag = () => {
    const clean = normalizeTag(tag);
    setTag("");
    if (!clean || page.tags_manual.includes(clean) || page.tags_manual.length >= MAX_PAGE_TAGS) return;
    actions.updatePage.mutate({ id: page.id, tags_manual: [...page.tags_manual, clean] }, { onError: fail });
  };

  const addAlias = () => {
    const clean = alias.trim().replace(/\s+/g, " ");
    setAlias("");
    if (
      !clean ||
      page.aliases.some((a) => a.toLowerCase() === clean.toLowerCase()) ||
      page.aliases.length >= MAX_PAGE_ALIASES
    ) {
      return;
    }
    actions.updatePage.mutate({ id: page.id, aliases: [...page.aliases, clean] }, { onError: fail });
  };

  const remove = async () => {
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
    onGone();
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

  const inlineTags = page.tags.filter((t) => !page.tags_manual.includes(t));

  return (
    <Box sx={{ maxWidth: 860, mx: "auto", px: { xs: 2, sm: 4 }, py: { xs: 1.5, sm: 3 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1, minHeight: 40 }}>
        {onBack && (
          <IconButton edge="start" aria-label="Back to the pages" onClick={onBack}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ flex: 1, minWidth: 0, display: { xs: "none", sm: "block" } }}
        >
          {[data.notebook?.name, data.section?.name].filter(Boolean).join(" / ")}
        </Typography>
        <Box sx={{ flex: { xs: 1, sm: 0 } }} />
        <Typography variant="caption" color="text.secondary" role="status" sx={{ mr: 1 }}>
          {page.can_edit ? label : "Read only"}
        </Typography>
        {page.can_edit && (
          <>
            <Tooltip title={page.favorite ? "Remove from favourites" : "Add to favourites"}>
              <IconButton
                aria-label={page.favorite ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={page.favorite}
                onClick={() =>
                  actions.favoritePage.mutate({ id: page.id, favorite: !page.favorite }, { onError: fail })
                }
              >
                {page.favorite ? <StarIcon sx={{ color: "warning.main" }} /> : <StarBorderIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Colour">
              <IconButton aria-label="Page colour" onClick={(e) => setColorAnchor(e.currentTarget)}>
                <PaletteOutlinedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={page.archived ? "Unarchive" : "Archive"}>
              <IconButton
                aria-label={page.archived ? "Unarchive" : "Archive"}
                onClick={() => actions.updatePage.mutate({ id: page.id, archived: !page.archived }, { onError: fail })}
              >
                {page.archived ? <UnarchiveOutlinedIcon /> : <ArchiveOutlinedIcon />}
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title={data.reminder ? "Reminder" : "Remind me"}>
          <IconButton
            aria-label="Reminder"
            color={data.reminder ? "primary" : "default"}
            onClick={(e) => setReminderAnchor(e.currentTarget)}
          >
            {data.reminder ? <NotificationsActiveIcon /> : <NotificationsNoneIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Share">
          <IconButton aria-label="Share page" onClick={() => setShareOpen(true)}>
            <ShareOutlinedIcon />
          </IconButton>
        </Tooltip>
        {page.can_manage && (
          <Tooltip title="Delete">
            <IconButton aria-label="Delete page" onClick={() => void remove()}>
              <DeleteOutlineIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <TitleField
        value={page.title}
        editable={page.can_edit}
        onCommit={(title) => actions.updatePage.mutate({ id: page.id, title }, { onError: fail })}
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", my: 1 }}>
        {page.tags_manual.map((t) => (
          <Chip
            key={t}
            size="small"
            variant="outlined"
            label={`#${t}`}
            onClick={links ? () => links.onOpenTag(t) : undefined}
            onDelete={
              page.can_edit
                ? () =>
                    actions.updatePage.mutate(
                      { id: page.id, tags_manual: page.tags_manual.filter((x) => x !== t) },
                      { onError: fail },
                    )
                : undefined
            }
          />
        ))}
        {inlineTags.map((t) => (
          <Chip
            key={t}
            size="small"
            variant="outlined"
            label={`#${t}`}
            onClick={links ? () => links.onOpenTag(t) : undefined}
          />
        ))}
        {page.can_edit && (
          <TextField
            size="small"
            variant="standard"
            placeholder="Add a tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            slotProps={{ htmlInput: { "aria-label": "Add a tag", maxLength: 40 }, input: { disableUnderline: true } }}
            sx={{ width: 120 }}
          />
        )}
      </Box>

      {(page.aliases.length > 0 || page.can_edit) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Also called
          </Typography>
          {page.aliases.map((a) => (
            <Chip
              key={a}
              size="small"
              label={a}
              onDelete={
                page.can_edit
                  ? () =>
                      actions.updatePage.mutate(
                        { id: page.id, aliases: page.aliases.filter((x) => x !== a) },
                        { onError: fail },
                      )
                  : undefined
              }
            />
          ))}
          {page.can_edit && (
            <TextField
              size="small"
              variant="standard"
              placeholder="Add another name"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAlias();
                }
              }}
              onBlur={addAlias}
              slotProps={{
                htmlInput: { "aria-label": "Add another name", maxLength: MAX_PAGE_TITLE },
                input: { disableUnderline: true },
              }}
              sx={{ width: 160 }}
            />
          )}
        </Box>
      )}

      <Suspense fallback={<DetailSkeleton height={280} />}>
        <PageEditor key={page.id} detail={data} onLabel={setLabel} links={links} />
      </Suspense>

      {!!data.children?.length && (
        <Box sx={{ mt: 2 }}>
          <Typography component="h2" variant="subtitle2">
            Sub-pages
          </Typography>
          {data.children.map((child) => (
            <Button key={child.id} onClick={() => links?.onOpenPage(child.id)}>
              {pageTitle(child.title)}
            </Button>
          ))}
        </Box>
      )}

      {reminderAnchor && (
        <NoteReminderMenu
          anchor={reminderAnchor}
          onClose={() => setReminderAnchor(null)}
          reminder={data.reminder ?? null}
          onSet={(at) => reminderAction.mutate(at, { onError: fail })}
        />
      )}

      {shareOpen && (
        <PageShareDialog
          pageId={page.id}
          title={pageTitle(page.title)}
          onClose={() => setShareOpen(false)}
          onLeave={onGone}
        />
      )}

      <PageReferences pageId={page.id} onOpenPage={links?.onOpenPage ?? (() => undefined)} />

      <NoteColorPopover
        anchor={colorAnchor}
        value={page.color}
        onPick={(color) => {
          setColorAnchor(null);
          actions.updatePage.mutate({ id: page.id, color }, { onError: fail });
        }}
        onClose={() => setColorAnchor(null)}
      />
    </Box>
  );
}
