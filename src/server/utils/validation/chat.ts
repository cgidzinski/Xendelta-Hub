import { z } from "zod";
import { objectIdSchema } from "./core";
import { customIdOfReaction } from "../../../shared/emoji";
import {
  CHAT_BODY_MAX,
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_MEMBERS,
  CHAT_NAME_MAX,
  CHAT_PAGE_SIZE,
} from "../../../shared/chat";

const seq = z.coerce.number().int().min(1);
// One emoji (it may be several code points: skin tones, flags, joined sequences).
// Or a custom emoji, written `c:<its id>` (the route checks it belongs to the chat).
const emoji = z
  .string()
  .min(1)
  .max(26)
  .refine(
    (v) =>
      customIdOfReaction(v) !== null || (v.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(v)),
    {
      message: "Not an emoji",
    },
  );

export const chatConversationParamSchema = z.object({ conversationId: objectIdSchema });
export const chatMessageParamSchema = z.object({ conversationId: objectIdSchema, seq });
export const chatReactionParamSchema = z.object({ conversationId: objectIdSchema, seq, emoji });
export const chatMemberParamSchema = z.object({ conversationId: objectIdSchema, userId: objectIdSchema });
export const chatAttachmentParamSchema = z.object({ conversationId: objectIdSchema, seq, fileId: objectIdSchema });

export const chatListQuerySchema = z.object({
  /** The `lastMessage.at` of the last conversation on the previous page. */
  cursor: z
    .string()
    .max(40)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid cursor" })
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const chatMessagesQuerySchema = z.object({
  /** Messages older than this number. Omit for the newest. */
  before: seq.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(CHAT_PAGE_SIZE),
});

export const createChatSchema = z.object({
  userIds: z
    .array(objectIdSchema)
    .min(1, "Pick at least one person")
    .max(CHAT_MAX_MEMBERS - 1),
  name: z.string().trim().min(1).max(CHAT_NAME_MAX).optional(),
});
export const renameChatSchema = z.object({
  /** Empty clears the name, so the chat shows its members' names again. */
  name: z.string().trim().max(CHAT_NAME_MAX),
});
export const addChatMembersSchema = z.object({
  userIds: z
    .array(objectIdSchema)
    .min(1)
    .max(CHAT_MAX_MEMBERS - 1),
});
export const chatOwnerSchema = z.object({ role: z.literal("owner") });
export const chatMeSchema = z.object({ muted: z.boolean().optional(), hidden: z.boolean().optional() });
export const chatReadSchema = z.object({ seq: z.number().int().min(0) });

export const sendChatMessageSchema = z
  .object({
    /** Chosen by the sender's client; a retried send with the same one is stored once. */
    clientId: z.string().min(8).max(64).optional(),
    body: z.string().max(CHAT_BODY_MAX).default(""),
    replyTo: z.number().int().min(1).optional(),
    /** XenDrive files the sender owns. */
    attachmentIds: z.array(objectIdSchema).max(CHAT_MAX_ATTACHMENTS).optional(),
  })
  .refine((v) => v.body.trim().length > 0 || (v.attachmentIds?.length ?? 0) > 0, {
    message: "Write a message or attach a file",
  });
export const editChatMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(CHAT_BODY_MAX),
});
