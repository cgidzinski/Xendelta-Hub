import { z } from "zod";
import { objectIdSchema } from "./core";
import { customIdOfReaction } from "../../../shared/emoji";
import { isGifHost } from "../../../shared/gif";
import {
  CHAT_BODY_MAX,
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_FORWARD_TARGETS,
  CHAT_MAX_MEMBERS,
  CHAT_NAME_MAX,
  CHAT_PAGE_SIZE,
  CHAT_SEARCH_HAS,
  CHAT_SEARCH_MAX_QUERY,
  CHAT_SEARCH_PAGE,
  POLL_MAX_DAYS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  VOICE_MAX_SECONDS,
  VOICE_WAVEFORM_BARS,
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
export const chatMessagesQuerySchema = z
  .object({
    /** Messages older than this number. Omit for the newest. */
    before: seq.optional(),
    /** A window of history centred on this message (a jump to a link, a reply or the first unread). */
    around: seq.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(CHAT_PAGE_SIZE),
  })
  .refine((v) => !(v.before && v.around), { message: "Ask for before or around, not both" });

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

const gifUrl = z.string().max(500).refine(isGifHost, { message: "That isn't a GIF from the picker" });
const chatGifSchema = z.object({
  url: gifUrl,
  stillUrl: gifUrl,
  width: z.number().int().min(1).max(2000),
  height: z.number().int().min(1).max(2000),
  title: z.string().max(120).default(""),
});

const chatVoiceSchema = z.object({
  duration: z.number().min(0.5).max(VOICE_MAX_SECONDS),
  waveform: z.array(z.number().int().min(0).max(255)).length(VOICE_WAVEFORM_BARS),
});

export const sendChatMessageSchema = z
  .object({
    /** Chosen by the sender's client; a retried send with the same one is stored once. */
    clientId: z.string().min(8).max(64).optional(),
    body: z.string().max(CHAT_BODY_MAX).default(""),
    replyTo: z.number().int().min(1).optional(),
    /** Post into the thread of this message instead of the main chat. */
    threadRoot: z.number().int().min(1).optional(),
    /** XenDrive files the sender owns. */
    attachmentIds: z.array(objectIdSchema).max(CHAT_MAX_ATTACHMENTS).optional(),
    /** A GIF from the picker. */
    gif: chatGifSchema.optional(),
    /** Marks the one attachment as a voice message. */
    voice: chatVoiceSchema.optional(),
  })
  .refine((v) => v.body.trim().length > 0 || (v.attachmentIds?.length ?? 0) > 0 || !!v.gif, {
    message: "Write a message or attach a file",
  });
export const editChatMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(CHAT_BODY_MAX),
});

const isoDate = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" });

export const chatSearchQuerySchema = z
  .object({
    q: z.string().trim().max(CHAT_SEARCH_MAX_QUERY).optional(),
    conversationId: objectIdSchema.optional(),
    communityId: objectIdSchema.optional(),
    from: objectIdSchema.optional(),
    has: z.enum(CHAT_SEARCH_HAS).optional(),
    before: isoDate.optional(),
    after: isoDate.optional(),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(CHAT_SEARCH_PAGE),
  })
  .refine((v) => !!v.q || !!v.from || !!v.has, { message: "Search for some words, a person or a kind of message" });

export const createPollSchema = z.object({
  question: z.string().trim().min(1, "Ask a question").max(POLL_QUESTION_MAX),
  options: z
    .array(z.string().trim().min(1, "An option can't be empty").max(POLL_OPTION_MAX))
    .min(POLL_MIN_OPTIONS, `Give at least ${POLL_MIN_OPTIONS} options`)
    .max(POLL_MAX_OPTIONS)
    .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, {
      message: "Each option must be different",
    }),
  multiple: z.boolean().default(false),
  /** ISO time in the future, no more than POLL_MAX_DAYS ahead; omit for a poll that stays open until closed. */
  endsAt: z
    .string()
    .max(40)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid time" })
    .refine((v) => Date.parse(v) > Date.now() + 30_000, { message: "Pick a time in the future" })
    .refine((v) => Date.parse(v) <= Date.now() + POLL_MAX_DAYS * 86_400_000, {
      message: `A poll can run for at most ${POLL_MAX_DAYS} days`,
    })
    .optional(),
});
/** The options chosen; empty takes the vote back. */
export const pollVoteSchema = z.object({ optionIds: z.array(z.string().regex(/^\d{1,2}$/)).max(POLL_MAX_OPTIONS) });

export const forwardMessageSchema = z.object({
  toConversationIds: z
    .array(objectIdSchema)
    .min(1, "Pick a chat")
    .max(CHAT_MAX_FORWARD_TARGETS)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Pick each chat once" }),
});
