import { CUSTOM_EMOJI_NAME_MAX } from "@shared/emoji";

/** A name for an emoji from its file's name: "Party Blob (2).png" becomes "party_blob_2". Empty if nothing usable is left. */
export function suggestEmojiName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CUSTOM_EMOJI_NAME_MAX)
    .replace(/_+$/g, "");
}
