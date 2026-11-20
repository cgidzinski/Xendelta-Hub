import { createPortal } from "react-dom";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { Box, Button, Link, Stack, TextField } from "@mui/material";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import { Node } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { createPageExtensions } from "@shared/xennote/pageSchema";
import { isSafeUrl } from "@shared/xennote/notes";
import { normalizeTitle } from "@shared/xennote/wikiLinks";
import { noteDocToMarkdown, noteMarkdownToDoc } from "@shared/xennote/noteBlockMarkdown";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import EditorToolbar from "./EditorToolbar";
import { WikiLinkSuggestion, type LinkMenuState } from "./LinkSuggestions";
import LinkMenu from "./LinkMenu";
import SlashMenu from "./SlashMenu";
import { SlashCommand, type SlashState } from "./SlashCommand";
import { SLASH_ITEMS } from "./slashItems";
import { runSlashItem } from "./slashCommands";
import { editorSx } from "./editorSx";

const Titles = createContext<{ resolve: (title: string) => string | undefined; open: (id: string) => void }>({
  resolve: () => undefined,
  open: () => undefined,
});

function NoteLinkView({ node }: NodeViewProps) {
  const titles = useContext(Titles);
  const title = String(node.attrs.title ?? "");
  const label = String(node.attrs.label || title);
  const id = titles.resolve(title);
  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      {id ? (
        <Link component="button" variant="inherit" onClick={() => titles.open(id)}>
          {label}
        </Link>
      ) : (
        <span>{`[[${label}]]`}</span>
      )}
    </NodeViewWrapper>
  );
}

const NoteLink = Node.create({
  name: "noteLink",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      title: { default: "", parseHTML: (element) => element.getAttribute("title") ?? "" },
      label: { default: "" },
    };
  },
  parseHTML: () => [{ tag: "span[data-type='noteLink']" }],
  renderHTML: ({ node }) => [
    "span",
    { "data-type": "noteLink", title: node.attrs.title, label: node.attrs.label },
    node.attrs.label || node.attrs.title,
  ],
  addNodeView: () => ReactNodeViewRenderer(NoteLinkView),
});

const excluded = new Set([
  "callout",
  "imageBlock",
  "fileBlock",
  "bookmark",
  "wikiLink",
  "blockRef",
  "blockEmbed",
  "pageQuery",
  "hashtag",
  "uniqueID",
]);

const noteSlashItems = SLASH_ITEMS.filter(({ id }) =>
  [
    "heading1",
    "heading2",
    "heading3",
    "bulletList",
    "orderedList",
    "taskList",
    "quote",
    "codeBlock",
    "table",
    "divider",
  ].includes(id),
);

export default function NoteBlockEditor({
  body,
  noteId,
  titles,
  onBody,
  onOpenNote,
  onSource,
  mobileToolbar,
}: {
  body: string;
  noteId: string | null;
  titles: Array<{ _id: string; title: string }>;
  onBody: (body: string) => void;
  onOpenNote: (id: string) => void;
  onSource: () => void;
  mobileToolbar?: HTMLDivElement | null;
}) {
  const source = useRef(body);
  const initial = useRef("");
  const latest = useRef({ titles, noteId, onBody });
  latest.current = { titles, noteId, onBody };
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashKey = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const [menu, setMenu] = useState<LinkMenuState | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const menuKey = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const extensions = useMemo(
    () => [
      ...createPageExtensions().filter((extension) => !excluded.has(extension.name)),
      NoteLink,
      UndoRedo,
      SlashCommand.configure({
        items: noteSlashItems,
        onState: setSlash,
        onKey: (event) => slashKey.current?.(event) ?? false,
        run: (id, editor, range) => runSlashItem(id, editor, range),
      }),
      WikiLinkSuggestion.configure({
        onState: setMenu,
        onKey: (event) => menuKey.current?.(event) ?? false,
        load: (term) =>
          latest.current.titles
            .filter(
              (note) =>
                note._id !== latest.current.noteId &&
                !/[\[\]|\n]/.test(note.title) &&
                normalizeTitle(note.title).includes(normalizeTitle(term)),
            )
            .slice(0, 8)
            .map((note) => ({ kind: "note" as const, id: note._id, title: note.title })),
        choose: (editor, range, item) => {
          if (item.kind === "note")
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: "noteLink", attrs: { title: item.title } },
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
    content: noteMarkdownToDoc(source.current),
    immediatelyRender: false,
    editorProps: { attributes: { role: "textbox", "aria-label": "Note", "aria-multiline": "true" } },
    onCreate: ({ editor }) => {
      initial.current = JSON.stringify(editor.getJSON());
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON();
      latest.current.onBody(JSON.stringify(doc) === initial.current ? source.current : noteDocToMarkdown(doc));
    },
  });
  const linkValid = link === "" || isSafeUrl(link ?? "");
  const applyLink = () => {
    if (!linkValid || !editor) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (link) chain.setLink({ href: link }).run();
    else chain.unsetLink().run();
    setLink(null);
  };

  const toolbar = editor && (
    <EditorToolbar
      editor={editor}
      compact
      onLink={() => setLink(editor.getAttributes("link").href ?? "")}
      onNoteLink={() => editor.chain().focus().insertContent("[[").run()}
    />
  );

  return (
    <Titles.Provider
      value={{
        resolve: (title) => titles.find((item) => normalizeTitle(item.title) === normalizeTitle(title))?._id,
        open: onOpenNote,
      }}
    >
      <Stack spacing={1}>
        <Button size="small" onClick={onSource} sx={{ alignSelf: "end" }}>
          Edit Markdown source
        </Button>
        {mobileToolbar === undefined && toolbar}
        <Box sx={{ ...editorSx, minHeight: 160 }}>
          <EditorContent editor={editor} />
        </Box>
        {mobileToolbar && toolbar && createPortal(toolbar, mobileToolbar)}
      </Stack>
      <SlashMenu state={slash} keyRef={slashKey} />
      <LinkMenu state={menu} keyRef={menuKey} label="Notes" />
      {link !== null && (
        <ResponsiveDialog
          open
          title="Link"
          onClose={() => setLink(null)}
          actions={
            <>
              <Button onClick={() => setLink(null)}>Cancel</Button>
              <Button onClick={applyLink} disabled={!linkValid}>
                Apply
              </Button>
            </>
          }
        >
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            label="Web address"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            error={!linkValid}
          />
        </ResponsiveDialog>
      )}
    </Titles.Provider>
  );
}
