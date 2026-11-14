import { plainEmojiText } from "./emoji";
import { MENTION_TOKEN } from "./mentions";

// A message may use a little Markdown (bold, italic, strikethrough, code, quotes, spoilers, links). This is the other
// direction: the same message as plain words, for the one-line preview in a list, a push notification, or a quote.

/** The body with its formatting marks removed: `**hi**` is `hi`, a link is its words, a spoiler is hidden. */
export function stripMarkdown(body: string): string {
  return (
    body
      // A code block or a bit of code is its content.
      .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
      .replace(/`([^`\n]+)`/g, "$1")
      // A spoiler isn't given away in a preview.
      .replace(/\|\|[\s\S]+?\|\|/g, "▒▒▒")
      // [words](address) is its words; an image is its description.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/(?<!\w)__(.+?)__(?!\w)/g, "$1")
      .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
      // An underscore only marks italics at the edge of a word, so snake_case_names are left alone.
      .replace(/(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
  );
}

/**
 * The body as one plain line of words: custom emoji as `:name:`, a mention as `@name` (`@someone` when the name isn't
 * known), and no formatting marks.
 */
export const plainMessageText = (body: string, names?: ReadonlyMap<string, string>) =>
  stripMarkdown(plainEmojiText(body).replace(MENTION_TOKEN, (_m, id: string) => `@${names?.get(id) ?? "someone"}`));
