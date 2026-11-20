import type { JSONContent } from "@tiptap/core";
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
