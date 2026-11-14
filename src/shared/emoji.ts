// Custom emoji: pictures a community or a group chat uploads, used as `:name:` in messages and as reactions.
// A message body holds one as the token `<:name:id>`; a reaction's key is `c:<id>`.

export const CUSTOM_EMOJI_NAME_MIN = 2;
export const CUSTOM_EMOJI_NAME_MAX = 32;
/** Letters, digits and underscores, so a name is safe to type after a colon. */
export const CUSTOM_EMOJI_NAME_PATTERN = /^[a-z0-9_]+$/;
export const CUSTOM_EMOJI_MAX_PER_SCOPE = 50;
/** What may be uploaded. It is resized to fit a square of CUSTOM_EMOJI_SIZE before it is stored. */
export const CUSTOM_EMOJI_MAX_UPLOAD_BYTES = 512 * 1024;
export const CUSTOM_EMOJI_SIZE = 128;
export const CUSTOM_EMOJI_MIMES = ["image/png", "image/gif", "image/webp"] as const;

/** Whose it is: a community's, or a group chat's. */
export interface CustomEmojiScope {
  type: "community" | "chat";
  id: string;
}

export interface CustomEmoji {
  _id: string;
  name: string;
  url: string;
  animated: boolean;
  scope: CustomEmojiScope;
  createdBy: string;
}

/** The token that puts a custom emoji in a message body. */
export const emojiToken = (emoji: Pick<CustomEmoji, "name" | "_id">) => `<:${emoji.name}:${emoji._id}>`;

/** A custom emoji token inside a message body: `<:name:id>`. */
export const EMOJI_TOKEN = /<:([a-z0-9_]{2,32}):([a-f0-9]{24})>/g;

/** A reaction's key for a custom emoji. A Unicode emoji is its own key. */
export const customReactionKey = (emojiId: string) => `c:${emojiId}`;
export const customIdOfReaction = (key: string): string | null => (/^c:[a-f0-9]{24}$/.test(key) ? key.slice(2) : null);

/** The body as plain text, with each custom emoji written as `:name:` (for previews, notifications and quotes). */
export const plainEmojiText = (body: string) => body.replace(EMOJI_TOKEN, ":$1:");
