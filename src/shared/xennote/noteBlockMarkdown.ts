import type { Nodes } from "mdast";
import type { JSONContent } from "@tiptap/core";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { findMention } from "./linkMention";
import { docToMarkdown, markdownToDoc } from "./convert/v1";

function translate(node: JSONContent, toNote: boolean): JSONContent {
  if (node.type === (toNote ? "wikiLink" : "noteLink")) {
    return {
      type: toNote ? "noteLink" : "wikiLink",
      attrs: { title: node.attrs?.title ?? "", label: node.attrs?.label ?? "" },
    };
  }
  return node.content ? { ...node, content: node.content.map((child) => translate(child, toNote)) } : node;
}

export const noteMarkdownToDoc = (markdown: string) => translate(markdownToDoc(markdown), true);
export const noteDocToMarkdown = (doc: JSONContent) => docToMarkdown(translate(doc, false));

const parser = unified().use(remarkParse).use(remarkGfm);

// Older notes can contain Markdown that the reduced block schema cannot preserve on an edit.
export function canEditWithNoteBlocks(markdown: string): boolean {
  const withoutPositions = (source: string) =>
    JSON.stringify(parser.parse(source), (key, value: unknown) => (key === "position" ? undefined : value));
  return withoutPositions(markdown) === withoutPositions(noteDocToMarkdown(noteMarkdownToDoc(markdown)));
}

// Locate a mention in a plain Markdown text node so linking it can patch the source in place.
export function findNoteMention(markdown: string, title: string): { index: number; length: number } | undefined {
  const target = { id: "", title, aliases: [] };
  const visit = (node: Nodes): ReturnType<typeof findNoteMention> => {
    if (node.type === "text") {
      const from = node.position?.start.offset;
      const to = node.position?.end.offset;
      if (from === undefined || markdown.slice(from, to) !== node.value) return;
      const match = findMention(node.value, target);
      if (match) return { index: from + match.index, length: match.length };
    } else if (
      "children" in node &&
      node.type !== "link" &&
      node.type !== "linkReference" &&
      node.type !== "footnoteDefinition"
    ) {
      for (const child of node.children) {
        const match = visit(child);
        if (match) return match;
      }
    }
  };
  return visit(parser.parse(markdown));
}
