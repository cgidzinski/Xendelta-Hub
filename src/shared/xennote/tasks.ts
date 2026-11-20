import type { JSONContent } from "@tiptap/core";
import { walkBlocks } from "./blockReferences";
import { deriveFromDoc } from "./deriveFromDoc";

export interface PageTask {
  block_id: string;
  text: string;
  done: boolean;
}

export function deriveTasks(doc: JSONContent): PageTask[] {
  const tasks: PageTask[] = [];
  walkBlocks(doc, (node) => {
    const id = node.attrs?.id;
    if (node.type !== "taskItem" || typeof id !== "string") return;
    const text = node.content?.[0] ? deriveFromDoc(node.content[0]).search_text.slice(0, 500) : "";
    tasks.push({ block_id: id, text, done: node.attrs?.checked === true });
  });
  return tasks;
}

export interface ListedTask extends PageTask {
  page_id: string;
  page_title: string;
  notebook_id: string | null;
  notebook_name: string | null;
  can_edit: boolean;
}
