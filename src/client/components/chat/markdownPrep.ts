import { EMOJI_TOKEN } from "@shared/emoji";

// A message's Markdown is read by react-markdown, which knows nothing of custom emoji or spoilers. Both are written as
// links to an address no browser follows (`emoji:<id>` and `spoiler:`), and the renderer draws those links its own way.
export const EMOJI_SCHEME = "emoji:";
export const SPOILER_SCHEME = "spoiler:";

/** Code (a block or a bit inline) is left exactly as written, so `||` and `<:x:id>` inside it stay literal. */
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/g;

/** The message ready for the Markdown reader. */
export function prepareMarkdown(body: string): string {
  return body
    .split(CODE)
    .map((piece, i) =>
      i % 2 === 1
        ? piece // a piece of code
        : piece
            // Only a Markdown link may hold an emoji, so `<:x:id>` becomes a link whose text is its name.
            .replace(EMOJI_TOKEN, (_all, name: string, id: string) => `[:${name}:](${EMOJI_SCHEME}${id})`)
            // ||hidden words|| become a link the renderer turns into a click-to-reveal.
            .replace(
              /\|\|([\s\S]+?)\|\|/g,
              (_all, inner: string) => `[${inner.replace(/([[\]])/g, "\\$1")}](${SPOILER_SCHEME})`,
            )
            // A line that starts with # is not a heading in chat.
            .replace(/^(\s{0,3})(#{1,6}\s)/gm, "$1\\$2"),
    )
    .join("");
}

/** The id of the custom emoji a prepared link means, or null. */
export const emojiIdFromHref = (href: string | undefined): string | null =>
  href?.startsWith(EMOJI_SCHEME) ? href.slice(EMOJI_SCHEME.length) : null;

export const isSpoilerHref = (href: string | undefined): boolean => href === SPOILER_SCHEME;
