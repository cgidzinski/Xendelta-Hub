// A XenNote note to a page body (version 1 of the converter), for the migration that turns a notebook's notes into
// pages. Whatever a note type held becomes blocks, in the order it was shown:
//   text       the Markdown body
//   checklist  a to-do list, then any body text
//   image      the photos, then any body text
//   link       a bookmark, then any body text

import type { JSONContent } from "@tiptap/core";
import { isSafeUrl } from "../../notes";
import { ensureBlockIds } from "../../pageSchema";
import { markdownToDoc, type MarkdownToDocOptions } from "./markdownToDoc";

export interface NoteToDocInput {
  type: "text" | "checklist" | "image" | "link";
  body?: string | null;
  checklist?: { text?: string | null; done?: boolean | null }[] | null;
  images?: { file_id?: unknown }[] | null;
  link?: { url?: string | null; title?: string | null; description?: string | null } | null;
}

export function noteToDoc(note: NoteToDocInput, options: MarkdownToDocOptions = {}): JSONContent {
  const content: JSONContent[] = [];

  if (note.type === "image") {
    for (const image of note.images ?? []) {
      const id = image.file_id == null ? "" : String(image.file_id);
      if (id) content.push({ type: "imageBlock", attrs: { file_id: id, alt: "" } });
    }
  }

  if (note.type === "link" && note.link && (note.link.url || note.link.title)) {
    const url = note.link.url ?? "";
    content.push({
      type: "bookmark",
      attrs: { url: isSafeUrl(url) ? url : "", title: note.link.title ?? "", description: note.link.description ?? "" },
    });
  }

  if (note.type === "checklist" && note.checklist?.length) {
    content.push({
      type: "taskList",
      content: note.checklist.map((item) => ({
        type: "taskItem",
        attrs: { checked: item.done === true },
        content: [
          item.text ? { type: "paragraph", content: [{ type: "text", text: item.text }] } : { type: "paragraph" },
        ],
      })),
    });
  }

  if (note.body?.trim()) content.push(...(markdownToDoc(note.body, options).content ?? []));

  return ensureBlockIds({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] });
}
