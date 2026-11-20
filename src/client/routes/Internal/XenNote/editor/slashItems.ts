// The blocks the "/" menu offers. Pure data and a filter, so it can be tested; what each one does is in slashCommands.ts.

export type SlashItemId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock"
  | "callout"
  | "table"
  | "divider"
  | "file"
  | "blockRef"
  | "blockEmbed"
  | "pageQuery";

export interface SlashItem {
  id: SlashItemId;
  title: string;
  description: string;
  /** Other words someone might type to find it. */
  keywords: string[];
}

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    id: "pageQuery",
    title: "Page query",
    description: "Show pages matching a property filter",
    keywords: ["query", "properties"],
  },
  {
    id: "blockRef",
    title: "Block reference",
    description: "Link to a block on a page",
    keywords: ["reference", "link"],
  },
  {
    id: "blockEmbed",
    title: "Block embed",
    description: "Show a block from another page",
    keywords: ["embed", "transclude"],
  },
  { id: "heading1", title: "Heading 1", description: "A big section heading", keywords: ["h1", "title", "header"] },
  { id: "heading2", title: "Heading 2", description: "A medium heading", keywords: ["h2", "subtitle", "header"] },
  { id: "heading3", title: "Heading 3", description: "A small heading", keywords: ["h3", "header"] },
  { id: "bulletList", title: "Bulleted list", description: "A simple list", keywords: ["ul", "unordered", "bullets"] },
  { id: "orderedList", title: "Numbered list", description: "A list in order", keywords: ["ol", "ordered", "numbers"] },
  {
    id: "taskList",
    title: "To-do list",
    description: "Track tasks with checkboxes",
    keywords: ["todo", "checklist", "task", "checkbox"],
  },
  { id: "quote", title: "Quote", description: "Set a passage apart", keywords: ["blockquote", "cite"] },
  {
    id: "codeBlock",
    title: "Code",
    description: "Code in a fixed-width block",
    keywords: ["snippet", "pre", "monospace"],
  },
  {
    id: "callout",
    title: "Callout",
    description: "Highlight something important",
    keywords: ["note", "info", "warning", "tip", "alert"],
  },
  { id: "table", title: "Table", description: "Rows and columns", keywords: ["grid", "spreadsheet"] },
  {
    id: "divider",
    title: "Divider",
    description: "A line between sections",
    keywords: ["rule", "hr", "line", "separator"],
  },
  {
    id: "file",
    title: "Image or file",
    description: "Upload a picture, PDF or any file",
    keywords: ["upload", "photo", "picture", "attach", "pdf", "image"],
  },
];

/**
 * The items matching what was typed after the "/": every word must start a word of the title or one of its keywords.
 * Items whose title starts with the text come first. Nothing typed shows everything.
 */
export function filterSlashItems(query: string, items: readonly SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  const startsWord = (text: string, word: string) => text.split(/\s+/).some((w) => w.startsWith(word));
  const matches = items.filter((item) =>
    words.every((word) => startsWord(item.title.toLowerCase(), word) || item.keywords.some((k) => k.startsWith(word))),
  );
  const first = query.trim().toLowerCase();
  return [
    ...matches.filter((i) => i.title.toLowerCase().startsWith(first)),
    ...matches.filter((i) => !i.title.toLowerCase().startsWith(first)),
  ];
}
