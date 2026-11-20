import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useSnackbar } from "notistack";
import { isSafeUrl } from "@shared/xennote/notes";
import { createPageExtensions } from "@shared/xennote/pageSchema";
import Banner from "../../../../components/ui/Banner";
import ImageLightbox from "../../../../components/ui/ImageLightbox";
import UploadProgress from "../../../../components/ui/UploadProgress";
import { useUploadProgress } from "../../../../hooks/useUploadProgress";
import { uploadPageFiles } from "../../../../hooks/xennote/usePages";
import type { XenNotePageDetail } from "../../../../types/XenNotePage";
import EditorToolbar from "./EditorToolbar";
import SlashMenu from "./SlashMenu";
import { SlashCommand, type SlashState } from "./SlashCommand";
import { runSlashItem } from "./slashCommands";
import { editorSx } from "./editorSx";
import { BookmarkWithView, FileBlockWithView, ImageBlockWithView, PageFilesContext } from "./nodeViews";
import { usePageDraft } from "./usePageDraft";
import type { DraftLabel } from "./pageDraft";

interface PageEditorProps {
  detail: XenNotePageDetail;
  /** Told what to show beside the title ("Saved", "Saving…"). */
  onLabel?: (label: DraftLabel) => void;
}

/** The shared page nodes, with the ones that show a stored file drawn by React. */
const NODE_VIEWS: Record<string, unknown> = {
  imageBlock: ImageBlockWithView,
  fileBlock: FileBlockWithView,
  bookmark: BookmarkWithView,
};

/** A page's text: a block editor with a "/" menu, a toolbar, file uploads and autosave. Loaded on its own (lazy). */
export default function PageEditor({ detail, onLabel }: PageEditorProps) {
  const pageId = detail.page.id;
  const editable = detail.page.can_edit;
  const { enqueueSnackbar } = useSnackbar();
  const { percent, onUploadProgress, reset } = useUploadProgress();
  const [files, setFiles] = useState(detail.files);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [link, setLink] = useState<{ url: string; error: boolean } | null>(null);
  const slashKey = useRef<((event: KeyboardEvent) => boolean) | null>(null);
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
    editor?.setEditable(editable);
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
              {draft.remoteIsMe ? "This page was changed in another tab or device." : "Someone else changed this page."}
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
  );
}
