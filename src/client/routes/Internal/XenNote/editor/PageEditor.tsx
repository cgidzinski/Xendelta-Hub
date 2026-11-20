import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useSnackbar } from "notistack";
import { isSafeUrl } from "@shared/xennote/notes";
import { normalizeTag } from "@shared/xennote/pages";
import { createPageExtensions } from "@shared/xennote/pageSchema";
import Banner from "../../../../components/ui/Banner";
import ImageLightbox from "../../../../components/ui/ImageLightbox";
import UploadProgress from "../../../../components/ui/UploadProgress";
import { useUploadProgress } from "../../../../hooks/useUploadProgress";
import { suggestPages, uploadPageFiles } from "../../../../hooks/xennote/usePages";
import type { XenNotePageDetail } from "../../../../types/XenNotePage";
import EditorToolbar from "./EditorToolbar";
import SlashMenu from "./SlashMenu";
import { SlashCommand, type SlashState } from "./SlashCommand";
import { runSlashItem } from "./slashCommands";
import { editorSx } from "./editorSx";
import {
  BookmarkWithView,
  FileBlockWithView,
  HashtagWithView,
  ImageBlockWithView,
  PageFilesContext,
  WikiLinkWithView,
} from "./nodeViews";
import LinkMenu from "./LinkMenu";
import { HashtagSuggestion, WikiLinkSuggestion, type LinkItem, type LinkMenuState } from "./LinkSuggestions";
import { PageLinksContext, type PageLinksValue } from "./pageLinksContext";
import { usePageDraft } from "./usePageDraft";
import type { DraftLabel } from "./pageDraft";

interface PageEditorProps {
  detail: XenNotePageDetail;
  /** Told what to show beside the title ("Saved", "Saving…"). */
  onLabel?: (label: DraftLabel) => void;
  /** What links and tags in the text do (open a page, show a tag, make a page). */
  links?: PageLinksValue;
}

const defaultLinks: PageLinksValue = {
  notebookId: null,
  onOpenPage: () => undefined,
  onOpenTag: () => undefined,
  onCreatePage: async () => null,
  tags: () => [],
};

/** The shared page nodes, with the ones that show a stored file or a link drawn by React. */
const NODE_VIEWS: Record<string, unknown> = {
  imageBlock: ImageBlockWithView,
  fileBlock: FileBlockWithView,
  bookmark: BookmarkWithView,
  wikiLink: WikiLinkWithView,
  hashtag: HashtagWithView,
};

/** A page's text: a block editor with a "/" menu, a toolbar, file uploads and autosave. Loaded on its own (lazy). */
export default function PageEditor({ detail, onLabel, links }: PageEditorProps) {
  const pageId = detail.page.id;
  const editable = detail.page.can_edit;
  const { enqueueSnackbar } = useSnackbar();
  const { percent, onUploadProgress, reset } = useUploadProgress();
  const [files, setFiles] = useState(detail.files);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [link, setLink] = useState<{ url: string; error: boolean } | null>(null);
  const [wikiMenu, setWikiMenu] = useState<LinkMenuState | null>(null);
  const [tagMenu, setTagMenu] = useState<LinkMenuState | null>(null);
  const slashKey = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const wikiKey = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const tagKey = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const linksRef = useRef<PageLinksValue | undefined>(links);
  linksRef.current = links;
  const fileInput = useRef<HTMLInputElement>(null);
  // The editor's options are made once, so what they call is reached through refs.
  const uploadRef = useRef<(list: File[]) => void>(() => undefined);
  const editedRef = useRef<() => void>(() => undefined);

  const extensions = useMemo(
    () => [
      ...createPageExtensions().map((ext) => (NODE_VIEWS[ext.name] as typeof ext | undefined) ?? ext),
      UndoRedo,
      Dropcursor,
      Gapcursor,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Type / for blocks"),
      }),
      SlashCommand.configure({
        onState: setSlash,
        onKey: (event) => slashKey.current?.(event) ?? false,
        run: (id, editor, range) => runSlashItem(id, editor, range, { pickFiles: () => fileInput.current?.click() }),
      }),
      // "[[" offers pages (and making one); "#" offers the tags in use (and a new one).
      WikiLinkSuggestion.configure({
        onState: setWikiMenu,
        onKey: (event) => wikiKey.current?.(event) ?? false,
        load: async (query): Promise<LinkItem[]> => {
          const hits = await suggestPages(query, linksRef.current?.notebookId ?? undefined).catch(() => []);
          const items: LinkItem[] = hits.map((h) => ({
            kind: "page",
            id: h.id,
            title: h.title,
            alias: h.matched_alias,
            subtitle: [h.notebook_name, h.section_name].filter(Boolean).join(" / ") || "Shared with you",
          }));
          const typed = query.trim();
          if (typed && !hits.some((h) => h.title.trim().toLowerCase() === typed.toLowerCase())) {
            items.push({ kind: "create", title: typed });
          }
          return items;
        },
        choose: async (editor, range, item) => {
          let page: { id: string; title: string } | null = null;
          if (item.kind === "page") page = { id: item.id, title: item.title };
          else if (item.kind === "create") {
            const id = await linksRef.current?.onCreatePage(item.title);
            if (id) page = { id, title: item.title };
          }
          if (!page) return;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "wikiLink", attrs: { page_id: page.id, title: page.title, label: "" } },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
      HashtagSuggestion.configure({
        onState: setTagMenu,
        onKey: (event) => tagKey.current?.(event) ?? false,
        load: (query): LinkItem[] => {
          const typed = normalizeTag(query);
          const known = (linksRef.current?.tags() ?? []).filter((t) => t.includes(typed)).slice(0, 8);
          const items: LinkItem[] = known.map((tag) => ({ kind: "tag", tag }));
          if (typed && !known.includes(typed)) items.push({ kind: "newtag", tag: typed });
          return items;
        },
        choose: (editor, range, item) => {
          if (item.kind !== "tag" && item.kind !== "newtag") return;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "hashtag", attrs: { tag: item.tag } },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: detail.doc,
    editable,
    editorProps: {
      attributes: { "aria-label": "Page text", role: "textbox", "aria-multiline": "true" },
      handlePaste: (_view, event) => {
        const pasted = Array.from(event.clipboardData?.files ?? []);
        if (pasted.length === 0) return false;
        uploadRef.current(pasted);
        return true;
      },
      handleDrop: (_view, event) => {
        const dropped = Array.from(event.dataTransfer?.files ?? []);
        if (dropped.length === 0) return false;
        event.preventDefault();
        uploadRef.current(dropped);
        return true;
      },
    },
    onUpdate: () => editedRef.current(),
  });

  const draft = usePageDraft({ pageId, initialRev: detail.page.rev, editor, editable });
  editedRef.current = draft.edited;
  useEffect(() => onLabel?.(draft.label), [draft.label, onLabel]);
  useEffect(() => {
    // Only when it really changed, and without an update event: that would be taken for typing and saved.
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);
  // A reload (someone else's save) can bring files this editor hasn't seen.
  useEffect(() => setFiles((prev) => ({ ...prev, ...detail.files })), [detail.files]);

  const upload = useCallback(
    async (list: File[]) => {
      if (!editor || !editable || list.length === 0) return;
      try {
        const uploaded = await uploadPageFiles(pageId, list, onUploadProgress);
        setFiles((prev) => ({ ...prev, ...Object.fromEntries(uploaded.map((f) => [f.id, f])) }));
        editor
          .chain()
          .focus()
          .insertContent(
            uploaded.map((f) =>
              f.mime.startsWith("image/")
                ? { type: "imageBlock", attrs: { file_id: f.id, alt: f.name } }
                : { type: "fileBlock", attrs: { file_id: f.id, name: f.name, size: f.size, mime: f.mime } },
            ),
          )
          .run();
      } catch (e) {
        enqueueSnackbar((e as Error).message || "Couldn't upload that", { variant: "error" });
      } finally {
        reset();
      }
    },
    [editor, editable, pageId, onUploadProgress, reset, enqueueSnackbar],
  );
  uploadRef.current = (list) => void upload(list);

  const openLink = () => {
    if (!editor) return;
    setLink({ url: (editor.getAttributes("link").href as string | undefined) ?? "", error: false });
  };
  const applyLink = () => {
    if (!editor || !link) return;
    const url = link.url.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (isSafeUrl(url)) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      setLink({ url: link.url, error: true });
      return;
    }
    setLink(null);
  };

  const filesValue = useMemo(() => ({ files, onOpenImage: setLightbox }), [files]);

  return (
    <PageLinksContext.Provider value={links ?? defaultLinks}>
      <PageFilesContext.Provider value={filesValue}>
        <Box sx={editorSx}>
          {editable && editor && (
            <EditorToolbar editor={editor} onPickFiles={() => fileInput.current?.click()} onLink={openLink} />
          )}
          {percent !== null && (
            <Box sx={{ my: 1 }}>
              <UploadProgress percent={percent} label="files" />
            </Box>
          )}
          <Box sx={{ pt: 2 }}>
            <EditorContent editor={editor} />
          </Box>
        </Box>

        <SlashMenu state={slash} keyRef={slashKey} />
        <LinkMenu state={wikiMenu} keyRef={wikiKey} label="Pages" />
        <LinkMenu state={tagMenu} keyRef={tagKey} label="Tags" />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label="Choose files to add to the page"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />

        <Dialog open={!!link} onClose={() => setLink(null)} fullWidth maxWidth="xs">
          <DialogTitle>Link</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              label="Web address"
              placeholder="https://"
              value={link?.url ?? ""}
              error={link?.error}
              helperText={
                link?.error ? "Only web addresses (http or https) can be linked" : "Leave empty to remove the link"
              }
              onChange={(e) => setLink({ url: e.target.value, error: false })}
              onKeyDown={(e) => e.key === "Enter" && applyLink()}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLink(null)}>Cancel</Button>
            <Button variant="contained" onClick={applyLink}>
              Apply
            </Button>
          </DialogActions>
        </Dialog>

        {draft.state.remote && (
          <Banner position="bottom" color="warning">
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexWrap: "wrap",
                justifyContent: "center",
                py: 0.5,
              }}
            >
              <Typography variant="body2" sx={{ color: "inherit" }}>
                {draft.remoteIsMe
                  ? "This page was changed in another tab or device."
                  : "Someone else changed this page."}
              </Typography>
              <Button size="small" color="inherit" variant="outlined" onClick={() => void draft.reload()}>
                Reload the newer version
              </Button>
              <Button size="small" color="inherit" onClick={draft.keepMine}>
                Keep mine
              </Button>
            </Box>
          </Banner>
        )}
      </PageFilesContext.Provider>
    </PageLinksContext.Provider>
  );
}
