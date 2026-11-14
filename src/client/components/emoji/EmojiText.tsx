import { Fragment } from "react";
import { customIdOfReaction, type CustomEmoji } from "@shared/emoji";
import { splitEmojiText } from "./emojiText";

/** One custom emoji as a picture that sits in a line of text (`size` is in em). */
export function CustomEmojiImage({ emoji, size = 1.4 }: { emoji: Pick<CustomEmoji, "name" | "url">; size?: number }) {
  return (
    <img
      src={emoji.url}
      alt={`:${emoji.name}:`}
      title={`:${emoji.name}:`}
      draggable={false}
      style={{ height: `${size}em`, width: "auto", verticalAlign: `${-0.3 * (size / 1.4)}em`, objectFit: "contain" }}
    />
  );
}

/**
 * A message body with its custom emoji drawn as pictures. An emoji that isn't known here (another community's, or
 * removed since) stays as `:name:`, so the sentence still reads.
 */
export function EmojiText({ body, byId, size }: { body: string; byId: Map<string, CustomEmoji>; size?: number }) {
  return (
    <>
      {splitEmojiText(body).map((part, i) => {
        if (part.type === "text") return <Fragment key={i}>{part.text}</Fragment>;
        const emoji = byId.get(part.id);
        return emoji ? (
          <CustomEmojiImage key={i} emoji={emoji} size={size} />
        ) : (
          <Fragment key={i}>{`:${part.name}:`}</Fragment>
        );
      })}
    </>
  );
}

/** What a reaction shows: the Unicode emoji, or the picture of a custom one (`:emoji:` if it is gone). */
export function ReactionEmoji({ reaction, byId }: { reaction: string; byId: Map<string, CustomEmoji> }) {
  const id = customIdOfReaction(reaction);
  if (!id) return <>{reaction}</>;
  const emoji = byId.get(id);
  return emoji ? <CustomEmojiImage emoji={emoji} size={1.25} /> : <>:emoji:</>;
}

/** A reaction as words, for a label or a tooltip: the emoji itself, or `:name:`. */
export function reactionLabel(reaction: string, byId: Map<string, CustomEmoji>): string {
  const id = customIdOfReaction(reaction);
  if (!id) return reaction;
  const emoji = byId.get(id);
  return emoji ? `:${emoji.name}:` : ":emoji:";
}
