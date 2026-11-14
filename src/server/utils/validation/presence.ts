import { z } from "zod";
import { CUSTOM_STATUS_EMOJI_MAX, CUSTOM_STATUS_TEXT_MAX, PRESENCE_CHOICES } from "../../../shared/presence";

const customStatus = z
  .object({
    text: z.string().trim().max(CUSTOM_STATUS_TEXT_MAX),
    emoji: z.string().trim().max(CUSTOM_STATUS_EMOJI_MAX).default(""),
    /** ISO time in the future, or null for never. */
    expiresAt: z
      .string()
      .max(40)
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid time" })
      .refine((v) => Date.parse(v) > Date.now(), { message: "That time has already passed" })
      .nullable()
      .default(null),
  })
  .refine((v) => v.text.length > 0 || v.emoji.length > 0, { message: "Say something or pick an emoji" });

/** Either part may be sent: change what is shown, the status line, or both. `customStatus: null` clears the line. */
export const updatePresenceSchema = z
  .object({
    choice: z.enum(PRESENCE_CHOICES).optional(),
    customStatus: customStatus.nullable().optional(),
  })
  .refine((v) => v.choice !== undefined || v.customStatus !== undefined, { message: "Nothing to change" });
