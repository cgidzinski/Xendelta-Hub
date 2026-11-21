import type { Editor, Range } from "@tiptap/core";
import type { SlashItemId } from "./slashItems";

export interface SlashContext {
  /** Open the file picker; what is chosen is uploaded and inserted where the caret is. */
  pickFiles: () => void;
  pickBlock: (kind: "blockRef" | "blockEmbed") => void;
}

/** Replace the "/…" the person typed with the block they chose. */
export function runSlashItem(id: SlashItemId, editor: Editor, range: Range, ctx?: SlashContext): void {
  const chain = editor.chain().focus().deleteRange(range);
  switch (id) {
    case "heading1":
      return void chain.toggleHeading({ level: 1 }).run();
    case "heading2":
      return void chain.toggleHeading({ level: 2 }).run();
    case "heading3":
      return void chain.toggleHeading({ level: 3 }).run();
    case "bulletList":
      return void chain.toggleBulletList().run();
    case "orderedList":
      return void chain.toggleOrderedList().run();
    case "taskList":
      return void chain.toggleTaskList().run();
    case "quote":
      return void chain.toggleBlockquote().run();
    case "codeBlock":
      return void chain.toggleCodeBlock().run();
    case "callout":
      return void chain
        .insertContent({ type: "callout", attrs: { tone: "info" }, content: [{ type: "paragraph" }] })
        .run();
    case "table":
      return void chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case "divider":
      return void chain.setHorizontalRule().run();
    case "pageQuery":
      return void chain.insertContent({ type: "pageQuery" }).run();
    case "blockRef":
    case "blockEmbed":
      chain.run();
      return ctx?.pickBlock(id);
    case "file":
      chain.run();
      return ctx?.pickFiles();
  }
}
