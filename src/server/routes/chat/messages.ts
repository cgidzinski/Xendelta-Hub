import type { Application, Request, Response } from "express";
import { Message, type MessageDocument } from "../../models/message";
import { Conversation } from "../../models/conversation";
import { XenDriveFile } from "../../models/xendriveFile";
import { generateSignedUrl } from "../../utils/gcsUtils";
import { authenticateToken } from "../../middleware/auth";
import { audienceOf, type ChatContext } from "../../chat/access";
import { refreshEmbeds } from "../../chat/embeds";
import { resolveMentions } from "../../chat/mentions";
import { canDeleteChatMessage, canEditMessage, canManageChat, canPostChat } from "../../chat/policy";
import {
  loadChatContext,
  loadPeople,
  postSystemMessage,
  publishMessage,
  appendMessage,
  serializeMessage,
  serializeMessages,
} from "../../chat/service";
import { readableChats, searchMessages } from "../../chat/search";
import { recordThreadReply, recordThreadReplyDeleted } from "../../chat/threads";
import { realtime } from "../../realtime";
import { AppError, callerId, loadCaller } from "../../utils/http";
import {
  validate,
  validateParams,
  validateQuery,
  chatAttachmentParamSchema,
  chatConversationParamSchema,
  chatMessageParamSchema,
  chatMessagesQuerySchema,
  chatReactionParamSchema,
  chatSearchQuerySchema,
  editChatMessageSchema,
  sendChatMessageSchema,
} from "../../utils/validation";
import { CHAT_MAX_PINS, CHAT_REACTIONS_PER_MESSAGE } from "@shared/chat";
import { customIdOfReaction } from "@shared/emoji";
import { plainMessageText } from "@shared/messageText";
import { CustomEmojiModel } from "../../models/customEmoji";

export function registerMessageRoutes(app: Application) {
  // Search the messages the caller can read: words, a sender, a kind of message, a date range.
  app.get(
    "/api/chat/search",
    authenticateToken,
    validateQuery(chatSearchQuerySchema),
    async (req: Request, res: Response) => {
      const query = chatSearchQuerySchema.parse(req.query);
      const chats = await readableChats(callerId(req), query);
      const { results, hasMore } = await searchMessages(chats, query);
      const people = await loadPeople(results.map((r) => r.message.from).filter((id): id is string => !!id));
      res.json({ status: true, message: "", data: { results, hasMore, people: [...people.values()] } });
    },
  );

  // A page of history, newest first. Ask for older ones with ?before=<the smallest seq you have>.
  app.get(
    "/api/chat/conversations/:conversationId/messages",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validateQuery(chatMessagesQuerySchema),
    async (req: Request, res: Response) => {
      const context = await loadChatContext(req.params.conversationId as string, callerId(req));
      const { chat } = context;
      const { before, around, limit } = chatMessagesQuerySchema.parse(req.query);
      let page: MessageDocument[];
      let hasMore: boolean;
      let hasNewer: boolean | undefined;
      if (around) {
        // A window with the target in the middle: half the page older (and the target), half newer.
        const half = Math.max(1, Math.floor(limit / 2));
        const older = await Message.find({
          conversationId: chat._id,
          threadRoot: { $exists: false },
          seq: { $lte: around },
        })
          .sort({ seq: -1 })
          .limit(half + 1)
          .exec();
        const newer = await Message.find({
          conversationId: chat._id,
          threadRoot: { $exists: false },
          seq: { $gt: around },
        })
          .sort({ seq: 1 })
          .limit(half + 1)
          .exec();
        page = [...newer.slice(0, half).reverse(), ...older.slice(0, half)];
        hasMore = older.length > half;
        hasNewer = newer.length > half;
      } else {
        const found = await Message.find({
          conversationId: chat._id,
          threadRoot: { $exists: false },
          ...(before ? { seq: { $lt: before } } : {}),
        })
          .sort({ seq: -1 })
          .limit(limit + 1)
          .exec();
        page = found.slice(0, limit);
        hasMore = found.length > limit;
      }
      // Senders who have since left the chat are not in the conversation's people, so they come with the page.
      const people = await loadPeople(page.map((m) => m.from).filter((id): id is string => !!id));
      res.json({
        status: true,
        message: "",
        data: {
          messages: await serializeMessages(page),
          hasMore,
          ...(hasNewer === undefined ? {} : { hasNewer }),
          people: [...people.values()],
        },
      });
    },
  );

  app.post(
    "/api/chat/conversations/:conversationId/messages",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validate(sendChatMessageSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const { chat } = context;
      if (!canPostChat(context.access, me)) throw new AppError(403, "You can't post here");
      const { clientId, body, replyTo, threadRoot, attachmentIds, gif } = sendChatMessageSchema.parse(req.body);

      // A retry of a send that already went through returns the stored message instead of sending it twice.
      if (clientId) {
        const earlier = await Message.findOne({ conversationId: chat._id, clientId }).exec();
        if (earlier) {
          return res.json({ status: true, message: "", data: { message: await serializeMessage(earlier) } });
        }
      }

      if (replyTo && !(await Message.exists({ conversationId: chat._id, seq: replyTo }))) {
        throw new AppError(400, "The message you're replying to doesn't exist");
      }

      // A thread reply needs a real message to hang off: not deleted, and not itself a reply.
      if (threadRoot) {
        const root = await Message.findOne({ conversationId: chat._id, seq: threadRoot }).exec();
        if (!root || root.kind !== "text" || root.deletedAt || typeof root.threadRoot === "number") {
          throw new AppError(400, "You can't start a thread on that message");
        }
      }

      // Attachments are XenDrive files the sender owns. Attaching one adds no storage: it is the same file.
      let attachments: Array<{ fileId: string; name: string; mimeType: string; size: number }> = [];
      if (attachmentIds?.length) {
        const unique = [...new Set(attachmentIds)];
        const files = await XenDriveFile.find({ _id: { $in: unique }, owner_id: me }).exec();
        if (files.length !== unique.length) throw new AppError(400, "You can only attach your own files");
        const byId = new Map(files.map((f) => [String(f._id), f]));
        attachments = unique.map((id) => {
          const f = byId.get(id)!;
          return { fileId: id, name: f.name, mimeType: f.mimeType, size: f.size ?? 0 };
        });
      }

      const user = await loadCaller(req);
      const message = await appendMessage(chat, {
        from: me,
        body,
        replyTo,
        threadRoot,
        gif,
        attachments,
        clientId,
        mentions: resolveMentions(context, me, body),
      });
      // The first reply opens the thread: the sender and the author of the message follow it, and the message shows the count.
      if (threadRoot) await recordThreadReply(context, threadRoot, message, me);
      await publishMessage(context, message, user.username ?? "Someone");
      // Previews of any links arrive a moment later, as an update; nobody waits for them.
      void refreshEmbeds(context, message._id);
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  // A link to download an attachment, for any member of the chat. The file stays private in the sender's XenDrive (no
  // public link is made); this checks that the caller is in the chat and the file is on that message, then signs one.
  app.get(
    "/api/chat/conversations/:conversationId/messages/:seq/attachments/:fileId",
    authenticateToken,
    validateParams(chatAttachmentParamSchema),
    async (req: Request, res: Response) => {
      const context = await loadChatContext(req.params.conversationId as string, callerId(req));
      const { chat } = context;
      const message = await loadMessage(chat._id, req.params.seq as string);
      const fileId = req.params.fileId as string;
      if (message.deletedAt || !message.attachments.some((a) => String(a.fileId) === fileId)) {
        throw new AppError(404, "Attachment not found");
      }
      const file = await XenDriveFile.findById(fileId).exec();
      if (!file) throw new AppError(404, "This file was removed from XenDrive");
      const url = await generateSignedUrl(file.storage_path, 15, { downloadName: file.name });
      res.json({ status: true, message: "", data: { url } });
    },
  );

  // Edit your own message.
  app.patch(
    "/api/chat/conversations/:conversationId/messages/:seq",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    validate(editChatMessageSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const { chat } = context;
      const message = await loadMessage(chat._id, req.params.seq as string);
      if (message.kind !== "text" || !canEditMessage(message, me))
        throw new AppError(403, "You can only edit your own messages");

      message.body = editChatMessageSchema.parse(req.body).body;
      // Editing can change who is mentioned, but it doesn't notify anyone again.
      const mentions = resolveMentions(context, me, message.body);
      message.set("mentions", mentions.userIds);
      message.mentionsEveryone = mentions.everyone;
      message.mentionsHere = mentions.here;
      message.editedAt = new Date();
      await message.save();
      await refreshLastPreview(chat._id, message.seq, plainMessageText(message.body));
      await announceUpdate(context, message);
      void refreshEmbeds(context, message._id);
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  // The messages pinned in this chat, newest pin first.
  app.get(
    "/api/chat/conversations/:conversationId/pins",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    async (req: Request, res: Response) => {
      const { chat } = await loadChatContext(req.params.conversationId as string, callerId(req));
      const pinned = await Message.find({
        conversationId: chat._id,
        pinnedAt: { $type: "date" },
        deletedAt: { $exists: false },
      })
        .sort({ pinnedAt: -1 })
        .limit(CHAT_MAX_PINS)
        .exec();
      // Senders who have since left are not in the chat's people, so they come with the pins (as with a page of history).
      const people = await loadPeople(pinned.map((m) => m.from).filter((id): id is string => !!id));
      res.json({
        status: true,
        message: "",
        data: { messages: await serializeMessages(pinned), people: [...people.values()] },
      });
    },
  );

  // Pin a message. In a community that needs the pin permission; in a group chat any member may.
  app.put(
    "/api/chat/conversations/:conversationId/messages/:seq/pin",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      if (!canPinIn(context, me)) throw new AppError(403, "You can't pin messages here");
      const message = await loadMessage(context.chat._id, req.params.seq as string);
      if (message.kind !== "text" || message.deletedAt) throw new AppError(400, "You can't pin that message");
      if (!message.pinnedAt) {
        const count = await Message.countDocuments({
          conversationId: context.chat._id,
          pinnedAt: { $type: "date" },
        }).exec();
        if (count >= CHAT_MAX_PINS) throw new AppError(400, `A chat can have at most ${CHAT_MAX_PINS} pinned messages`);
        message.pinnedAt = new Date();
        message.pinnedBy = me;
        await message.save();
        const who = (await loadCaller(req)).username ?? "Someone";
        await postSystemMessage(context.chat, me, "pinned", `${who} pinned a message`, {}, audienceOf(context));
        await announceUpdate(context, message);
      }
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  app.delete(
    "/api/chat/conversations/:conversationId/messages/:seq/pin",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      if (!canPinIn(context, me)) throw new AppError(403, "You can't unpin messages here");
      const message = await loadMessage(context.chat._id, req.params.seq as string);
      if (message.pinnedAt) {
        message.pinnedAt = undefined;
        message.pinnedBy = undefined;
        await message.save();
        await announceUpdate(context, message);
      }
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  // Take the link previews off a message (its sender, or anyone who can delete it). Editing it doesn't bring them back.
  app.delete(
    "/api/chat/conversations/:conversationId/messages/:seq/embeds",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const message = await loadMessage(context.chat._id, req.params.seq as string);
      if (message.kind !== "text" || !canDeleteChatMessage(context.access, message, me)) {
        throw new AppError(403, "You can't change that message");
      }
      message.set("embeds", []);
      message.embedsOff = true;
      await message.save();
      await announceUpdate(context, message);
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  // Delete a message: your own, or any if you own the chat. It stays as "deleted" so replies still make sense.
  app.delete(
    "/api/chat/conversations/:conversationId/messages/:seq",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const { chat } = context;
      const message = await loadMessage(chat._id, req.params.seq as string);
      if (message.kind !== "text" || !canDeleteChatMessage(context.access, message, me)) {
        throw new AppError(403, "You can't delete that message");
      }

      message.deletedAt = new Date();
      message.pinnedAt = undefined;
      message.pinnedBy = undefined;
      message.body = "";
      message.set("attachments", []);
      message.set("reactions", []);
      await message.save();
      await refreshLastPreview(chat._id, message.seq, "This message was deleted");
      if (typeof message.threadRoot === "number") await recordThreadReplyDeleted(context, message.threadRoot);
      await announceUpdate(context, message);
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  app.put(
    "/api/chat/conversations/:conversationId/messages/:seq/reactions/:emoji",
    authenticateToken,
    validateParams(chatReactionParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const { chat } = context;
      const message = await loadMessage(chat._id, req.params.seq as string);
      if (!canPostChat(context.access, me)) throw new AppError(403, "You can't react here");
      if (message.kind !== "text" || message.deletedAt) throw new AppError(400, "You can't react to that message");

      const emoji = req.params.emoji as string;
      // A custom emoji can be used only in the community or chat it belongs to.
      const customId = customIdOfReaction(emoji);
      if (customId && !(await emojiBelongsHere(customId, context))) {
        throw new AppError(400, "That emoji isn't available here");
      }
      const existing = message.reactions.find((r) => r.emoji === emoji);
      if (existing) {
        if (!existing.userIds.includes(me)) existing.userIds.push(me);
      } else {
        if (message.reactions.length >= CHAT_REACTIONS_PER_MESSAGE)
          throw new AppError(400, "That message has enough reactions");
        message.reactions.push({ emoji, userIds: [me] });
      }
      await message.save();
      await announceUpdate(context, message);
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  app.delete(
    "/api/chat/conversations/:conversationId/messages/:seq/reactions/:emoji",
    authenticateToken,
    validateParams(chatReactionParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const { chat } = context;
      const message = await loadMessage(chat._id, req.params.seq as string);

      const emoji = req.params.emoji as string;
      const existing = message.reactions.find((r) => r.emoji === emoji);
      if (existing) {
        existing.userIds = existing.userIds.filter((id) => id !== me);
        if (existing.userIds.length === 0)
          message.set(
            "reactions",
            message.reactions.filter((r) => r.emoji !== emoji),
          );
        await message.save();
        await announceUpdate(context, message);
      }
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );
}

async function loadMessage(conversationId: unknown, seq: string) {
  const message = await Message.findOne({ conversationId, seq: Number(seq) }).exec();
  if (!message) throw new AppError(404, "Message not found");
  return message;
}

async function announceUpdate(context: ChatContext, message: Awaited<ReturnType<typeof loadMessage>>) {
  realtime.toUsers(audienceOf(context), "chat:message_update", {
    conversationId: String(context.chat._id),
    message: await serializeMessage(message),
  });
}

// The list shows the newest message's text, so changing that message changes the list too.
async function refreshLastPreview(conversationId: unknown, seq: number, text: string) {
  await Conversation.updateOne(
    { _id: conversationId, "lastMessage.seq": seq },
    { $set: { "lastMessage.preview": text } },
  ).exec();
}

/** Whether this custom emoji belongs to the community the channel is in, or to this chat. */
async function emojiBelongsHere(emojiId: string, context: ChatContext): Promise<boolean> {
  const emoji = await CustomEmojiModel.findById(emojiId, "communityId conversationId").lean().exec();
  if (!emoji) return false;
  return context.community
    ? emoji.communityId === String(context.community._id)
    : emoji.conversationId === String(context.chat._id);
}

/** Who may pin and unpin: in a community, people with the pin permission; in a group chat, any member. */
const canPinIn = (context: ChatContext, userId: string) =>
  context.community ? canManageChat(context.access, userId, "pinMessages") : true;
