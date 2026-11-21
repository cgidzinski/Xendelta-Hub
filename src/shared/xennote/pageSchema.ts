// The shape of a notebook page's body, shared by the client editor and the server.
//
// The body is ProseMirror JSON, produced by TipTap. This file is the one list of extensions both sides use, so the
// server can check a body it receives (getSchema needs no DOM) and the editor adds its views and behaviour on top of
// the same schema. Nothing derived is ever stored inside the document: links, tags, files and search text are worked
// out from it (deriveFromDoc.ts).
//
// Ids: every block that can be referenced gets a stable `id` attribute, so a block can be linked to later and a
// future live-editing layer has something steady to anchor to. Inline links name a page by id, so renaming a page
// never rewrites another page's document.

import { Node as TipTapNode, getSchema, mergeAttributes, type Extensions, type JSONContent } from "@tiptap/core";
import { UniqueID, generateUniqueIds } from "@tiptap/extension-unique-id";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Node as PMNode, type Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { pageQuerySchema } from "./properties";
import { isSafeUrl } from "./notes";
import { MAX_PAGE_DOC_BYTES } from "./pages";

export const CALLOUT_TONES = ["info", "success", "warning", "danger"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/** A block the editor shows as a card: `{{date}}`-style templates and exports treat these as single units. */
export const Callout = TipTapNode.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "info",
        // The element is a DOM node in the editor; the server never calls this, and its types have no DOM.
        parseHTML: (el) =>
          (el as unknown as { getAttribute(name: string): string | null }).getAttribute("data-tone") ?? "info",
        renderHTML: (attrs) => ({ "data-tone": attrs.tone }),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-type="callout"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0],
});

/** An uploaded image. It names the stored file by id: a web address is never allowed as an image source. */
export const ImageBlock = TipTapNode.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      file_id: { default: null },
      alt: { default: "" },
      width: { default: null },
    };
  },
  parseHTML: () => [{ tag: "figure[data-type='imageBlock']" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", mergeAttributes(HTMLAttributes, { "data-type": "imageBlock" })],
});

/** Any other uploaded file, shown as a card (PDFs and text can preview). */
export const FileBlock = TipTapNode.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      file_id: { default: null },
      name: { default: "" },
      size: { default: 0 },
      mime: { default: "" },
    };
  },
  parseHTML: () => [{ tag: "div[data-type='fileBlock']" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "fileBlock" })],
});

/** A web address with a title and a description the author writes (the server never fetches the page). */
export const Bookmark = TipTapNode.create({
  name: "bookmark",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
    };
  },
  parseHTML: () => [{ tag: "div[data-type='bookmark']" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "bookmark" })],
});

/**
 * A link to another page, by id. `title` is what the author typed or last saw: it is shown while the target is
 * unresolved or locked, and used on export. `page_id` is null until the link points at a page.
 */
export const WikiLink = TipTapNode.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      page_id: { default: null },
      title: { default: "" },
      label: { default: "" },
    };
  },
  parseHTML: () => [{ tag: "span[data-type='wikiLink']" }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-type": "wikiLink" }),
    node.attrs.label || node.attrs.title,
  ],
});

/** A `#tag` inside the text. Tags belong to the page's notebook. */
export const Hashtag = TipTapNode.create({
  name: "hashtag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { tag: { default: "" } };
  },
  parseHTML: () => [{ tag: "span[data-type='hashtag']" }],
  renderHTML: ({ node, HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-type": "hashtag" }),
    `#${node.attrs.tag}`,
  ],
});

function blockLinkExtension(name: "blockRef" | "blockEmbed", inline: boolean) {
  const tag = inline ? "span" : "div";
  return TipTapNode.create({
    name,
    group: inline ? "inline" : "block",
    inline,
    atom: true,
    selectable: true,
    addAttributes() {
      return { page_id: { default: null }, block_id: { default: null } };
    },
    parseHTML: () => [{ tag: `${tag}[data-type='${name}']` }],
    renderHTML: ({ HTMLAttributes }) => [
      tag,
      mergeAttributes(HTMLAttributes, { "data-type": name }),
      inline ? "Block reference" : "Block embed",
    ],
  });
}
export const BlockRef = blockLinkExtension("blockRef", true);
export const BlockEmbed = blockLinkExtension("blockEmbed", false);

export const PageQuery = TipTapNode.create({
  name: "pageQuery",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      query: {
        default: null,
        parseHTML: (el) => {
          try {
            const raw = (el as unknown as { getAttribute(name: string): string | null }).getAttribute("data-query");
            const parsed = pageQuerySchema.safeParse(JSON.parse(raw ?? "null"));
            return parsed.success ? parsed.data : null;
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) => ({ "data-query": JSON.stringify(attrs.query) }),
      },
    };
  },
  parseHTML: () => [{ tag: "div[data-type='pageQuery']" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-type": "pageQuery" }),
    "Page query",
  ],
});

/** Blocks that get a stable `id`. Containers (lists, table rows and cells) don't: their items do. */
export const BLOCK_ID_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "taskItem",
  "callout",
  "table",
  "imageBlock",
  "fileBlock",
  "bookmark",
  "horizontalRule",
  "blockEmbed",
  "pageQuery",
] as const;

/**
 * Every extension the page schema is made of. The editor adds views, history, drag handles and suggestion menus on top;
 * those never change what a stored document can contain, so they are not here.
 */
export function createPageExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // A stored link is just its address: the editor adds target and rel when it draws one (it must set
      // rel="noopener noreferrer"), so they are not saved in every link mark.
      link: { openOnClick: false, autolink: false, HTMLAttributes: { target: null, rel: null, class: null } },
      // Behaviour only: the editor turns these on itself.
      undoRedo: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      listKeymap: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    Callout,
    ImageBlock,
    FileBlock,
    Bookmark,
    WikiLink,
    Hashtag,
    BlockRef,
    BlockEmbed,
    PageQuery,
    UniqueID.configure({ attributeName: "id", types: [...BLOCK_ID_TYPES] }),
  ];
}

let schema: Schema | null = null;

/** The ProseMirror schema for a page body. Built once. */
export function getPageSchema(): Schema {
  schema ??= getSchema(createPageExtensions());
  return schema;
}

/** A page with nothing written yet. */
export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Give every block that can be referenced an id, keeping the ones it already has. */
export function ensureBlockIds(doc: JSONContent): JSONContent {
  return generateUniqueIds(doc, createPageExtensions());
}

export type DocCheck = { ok: true; doc: JSONContent; bytes: number } | { ok: false; reason: string };

/** The size of a JSON value as stored, in UTF-8 bytes. */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Is this a valid page body? It must be a `doc`, fit in `MAX_PAGE_DOC_BYTES`, and every node, mark and attribute
 * must belong to the schema in an allowed position. The result is the same document, with block ids filled in.
 */
export function checkPageDoc(input: unknown): DocCheck {
  if (!input || typeof input !== "object" || (input as { type?: unknown }).type !== "doc") {
    return { ok: false, reason: "A page body must be a document." };
  }
  const bytes = jsonBytes(input);
  if (bytes > MAX_PAGE_DOC_BYTES) return { ok: false, reason: "This page is too large to save." };
  try {
    PMNode.fromJSON(getPageSchema(), input).check();
    const doc = ensureBlockIds(input as JSONContent);
    return { ok: true, doc, bytes: jsonBytes(doc) };
  } catch {
    return { ok: false, reason: "This page has content that can't be saved." };
  }
}

/**
 * Remove the parts of a body that must never reach a reader as a clickable address: a link mark whose address is
 * not http(s) loses the mark (its text stays), and a bookmark with an unsafe address loses the address.
 */
export function stripUnsafeLinks(doc: JSONContent): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    let next = node;
    if (node.marks?.some((m) => m.type === "link")) {
      const marks = node.marks.filter((m) => m.type !== "link" || isSafeUrl(String(m.attrs?.href ?? "")));
      const { marks: _before, ...rest } = next;
      next = marks.length ? { ...rest, marks } : rest;
    }
    if (node.type === "bookmark" && !isSafeUrl(String(node.attrs?.url ?? ""))) {
      next = { ...next, attrs: { ...node.attrs, url: "" } };
    }
    if (node.content) next = { ...next, content: node.content.map(walk) };
    return next;
  };
  return walk(doc);
}
