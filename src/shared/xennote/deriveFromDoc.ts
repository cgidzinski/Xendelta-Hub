// Everything stored next to a page's body that can be worked out from it. One pure function, run on every body save,
// so the page tree, backlinks, search and the graph never have to open a body. Nothing here is stored inside the document.

import type { JSONContent } from "@tiptap/core";
import { MAX_EXCERPT, MAX_PAGE_FILES, MAX_PAGE_LINKS, MAX_PAGE_TAGS, MAX_SEARCH_TEXT, normalizeTag } from "./pages";
import { normalizeTitle } from "./wikiLinks";

export interface DerivedPageFields {
  /** Pages this page links to, by id, each once. */
  links: string[];
  /** Titles of `[[links]]` that point at no page yet, normalised, each once. */
  unresolved: string[];
  /** `#tags` written in the text, normalised, each once. Tags added as page properties are not in here. */
  tags: string[];
  /** Stored files the page shows, by id, each once. */
  files: string[];
  /** Plain text of the whole page: what search looks through. */
  search_text: string;
  /** The first words, for lists. */
  excerpt: string;
  /** To-do blocks, ticked and not. */
  todo: { open: number; done: number };
  word_count: number;
}

/** Blocks after which the plain text gets a line break, so words from two blocks never run together. */
const BLOCKS = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "taskItem",
  "callout",
  "tableRow",
  "imageBlock",
  "fileBlock",
  "bookmark",
  "horizontalRule",
]);

export function deriveFromDoc(doc: JSONContent): DerivedPageFields {
  const links = new Set<string>();
  const unresolved = new Set<string>();
  const tags = new Set<string>();
  const files = new Set<string>();
  const todo = { open: 0, done: 0 };
  const text: string[] = [];

  const walk = (node: JSONContent): void => {
    switch (node.type) {
      case "text":
        text.push(node.text ?? "");
        return;
      case "hardBreak":
        text.push("\n");
        return;
      case "wikiLink": {
        const id = typeof node.attrs?.page_id === "string" ? node.attrs.page_id : "";
        const title = String(node.attrs?.title ?? "");
        if (id) links.add(id);
        else if (normalizeTitle(title)) unresolved.add(normalizeTitle(title));
        text.push(String(node.attrs?.label || title));
        return;
      }
      case "hashtag": {
        const tag = normalizeTag(String(node.attrs?.tag ?? ""));
        if (tag) {
          tags.add(tag);
          text.push(`#${tag}`);
        }
        return;
      }
      case "imageBlock": {
        const id = node.attrs?.file_id;
        if (typeof id === "string" && id) files.add(id);
        text.push(String(node.attrs?.alt ?? ""));
        break;
      }
      case "fileBlock": {
        const id = node.attrs?.file_id;
        if (typeof id === "string" && id) files.add(id);
        text.push(String(node.attrs?.name ?? ""));
        break;
      }
      case "bookmark":
        text.push(`${node.attrs?.title ?? ""} ${node.attrs?.url ?? ""} ${node.attrs?.description ?? ""}`);
        break;
      case "taskItem":
        if (node.attrs?.checked) todo.done += 1;
        else todo.open += 1;
        break;
    }
    node.content?.forEach(walk);
    if (node.type && BLOCKS.has(node.type)) text.push("\n");
  };
  walk(doc);

  const search_text = text
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, MAX_SEARCH_TEXT);
  const flat = search_text.replace(/\s+/g, " ");

  return {
    links: [...links].slice(0, MAX_PAGE_LINKS),
    unresolved: [...unresolved].slice(0, MAX_PAGE_LINKS),
    tags: [...tags].slice(0, MAX_PAGE_TAGS),
    files: [...files].slice(0, MAX_PAGE_FILES),
    search_text,
    excerpt: flat.slice(0, MAX_EXCERPT),
    todo,
    word_count: flat ? flat.split(" ").length : 0,
  };
}
