import { EMOJI_TOKEN } from "@shared/emoji";
import { MENTION_TOKEN } from "@shared/mentions";

// A message's Markdown is read by react-markdown, which knows nothing of custom emoji or spoilers. Both are written as
// links to an address no browser follows (`emoji:<id>` and `spoiler:`), and the renderer draws those links its own way.
export const EMOJI_SCHEME = "emoji:";
export const SPOILER_SCHEME = "spoiler:";
export const MENTION_SCHEME = "mention:";

/** Who a message mentions, as the server checked it: a name for each person, and whether it pings everyone or whoever is on. */
export interface MentionContext {
  nameOf: (userId: string) => string | undefined;
  /** The people the server accepted as mentioned. A token for anyone else reads as plain text. */
  ids: ReadonlySet<string>;
  everyone: boolean;
  here: boolean;
}

/** Code (a block or a bit inline) is left exactly as written, so `||` and `<:x:id>` inside it stay literal. */
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/g;

/** The message ready for the Markdown reader. */
export function prepareMarkdown(body: string, mentions?: MentionContext): string {
  return body
    .split(CODE)
    .map((piece, i) =>
      i % 2 === 1
        ? piece // a piece of code
        : piece
            // Only a Markdown link may hold an emoji, so `<:x:id>` becomes a link whose text is its name.
            .replace(EMOJI_TOKEN, (_all, name: string, id: string) => `[:${name}:](${EMOJI_SCHEME}${id})`)
            // A mention the server accepted becomes a link drawn as a chip; any other is just its words.
            .replace(MENTION_TOKEN, (_all, id: string) => {
              const name = mentions?.nameOf(id) ?? "someone";
              const safe = name.replace(/([\\[\]])/g, "\\$1");
              return mentions?.ids.has(id) ? `[@${safe}](${MENTION_SCHEME}${id})` : `@${safe}`;
            })
            // @everyone and @here are chips only when the server let this message use them.
            .replace(/(^|\s)@(everyone|here)(?!\w)/g, (all, lead: string, word: "everyone" | "here") =>
              mentions && mentions[word] ? `${lead}[@${word}](${MENTION_SCHEME}${word})` : all,
            )
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

/** Who a prepared mention link means: a user id, or "everyone" / "here"; null if the link isn't one. */
export const mentionFromHref = (href: string | undefined): string | null =>
  href?.startsWith(MENTION_SCHEME) ? href.slice(MENTION_SCHEME.length) : null;
