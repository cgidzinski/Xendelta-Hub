import { z } from "zod";
import { objectIdSchema } from "./core";
import { CUSTOM_EMOJI_NAME_MAX, CUSTOM_EMOJI_NAME_MIN, CUSTOM_EMOJI_NAME_PATTERN } from "../../../shared/emoji";

const emojiName = z
  .string()
  .trim()
  .toLowerCase()
  .min(CUSTOM_EMOJI_NAME_MIN, `Use at least ${CUSTOM_EMOJI_NAME_MIN} characters`)
  .max(CUSTOM_EMOJI_NAME_MAX, `Use at most ${CUSTOM_EMOJI_NAME_MAX} characters`)
  .regex(CUSTOM_EMOJI_NAME_PATTERN, "Use only letters, numbers and underscores");

export const emojiParamSchema = z.object({ emojiId: objectIdSchema });
export const renameEmojiSchema = z.object({ name: emojiName });
/** The text fields sent beside the picture when uploading (the body is multipart, read after multer). */
export const uploadEmojiSchema = z.object({
  name: emojiName,
  scopeType: z.enum(["community", "chat"]),
  scopeId: objectIdSchema,
});
