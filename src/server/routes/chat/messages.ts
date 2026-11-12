import type { Application, Request, Response } from "express";
import { Message } from "../../models/message";
import { Conversation } from "../../models/conversation";
import { XenDriveFile } from "../../models/xendriveFile";
import { authenticateToken } from "../../middleware/auth";
import { canDeleteMessage, canEditMessage } from "../../chat/policy";
import {
  loadChat,
  loadPeople,
  memberIdsOf,
  publishMessage,
  appendMessage,
  serializeMessage,
  serializeMessages,
} from "../../chat/service";
import { realtime } from "../../realtime";
import { AppError, callerId, loadCaller } from "../../utils/http";
import {
  validate,
  validateParams,
  validateQuery,
  chatConversationParamSchema,
  chatMessageParamSchema,
  chatMessagesQuerySchema,
  chatReactionParamSchema,
  editChatMessageSchema,
  sendChatMessageSchema,
} from "../../utils/validation";
import { CHAT_REACTIONS_PER_MESSAGE } from "@shared/chat";

export function registerMessageRoutes(app: Application) {
  // A page of history, newest first. Ask for older ones with ?before=<the smallest seq you have>.
  app.get(
    "/api/chat/conversations/:conversationId/messages",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validateQuery(chatMessagesQuerySchema),
    async (req: Request, res: Response) => {
      const chat = await loadChat(req.params.conversationId as string, callerId(req));
      const { before, limit } = chatMessagesQuerySchema.parse(req.query);
      const found = await Message.find({ conversationId: chat._id, ...(before ? { seq: { $lt: before } } : {}) })
        .sort({ seq: -1 })
        .limit(limit + 1)
        .exec();
      const page = found.slice(0, limit);
      // Senders who have since left the chat are not in the conversation's people, so they come with the page.
      const people = await loadPeople(page.map((m) => m.from).filter((id): id is string => !!id));
      res.json({
        status: true,
        message: "",
        data: {
          messages: await serializeMessages(page),
          hasMore: found.length > limit,
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
      const chat = await loadChat(req.params.conversationId as string, me);
      const { clientId, body, replyTo, attachmentIds } = sendChatMessageSchema.parse(req.body);

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
      const message = await appendMessage(chat, { from: me, body, replyTo, attachments, clientId });
      await publishMessage(chat, message, user.username ?? "Someone");
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
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
      const chat = await loadChat(req.params.conversationId as string, me);
      const message = await loadMessage(chat._id, req.params.seq as string);
      if (message.kind !== "text" || !canEditMessage(message, me))
        throw new AppError(403, "You can only edit your own messages");

      message.body = editChatMessageSchema.parse(req.body).body;
      message.editedAt = new Date();
      await message.save();
      await refreshLastPreview(chat._id, message.seq, message.body);
      await announceUpdate(chat, message);
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
      const chat = await loadChat(req.params.conversationId as string, me);
      const message = await loadMessage(chat._id, req.params.seq as string);
      if (message.kind !== "text" || !canDeleteMessage(chat, message, me)) {
        throw new AppError(403, "You can't delete that message");
      }

      message.deletedAt = new Date();
      message.body = "";
      message.set("attachments", []);
      message.set("reactions", []);
      await message.save();
      await refreshLastPreview(chat._id, message.seq, "This message was deleted");
      await announceUpdate(chat, message);
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  app.put(
    "/api/chat/conversations/:conversationId/messages/:seq/reactions/:emoji",
    authenticateToken,
    validateParams(chatReactionParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const chat = await loadChat(req.params.conversationId as string, me);
      const message = await loadMessage(chat._id, req.params.seq as string);
      if (message.kind !== "text" || message.deletedAt) throw new AppError(400, "You can't react to that message");

      const emoji = req.params.emoji as string;
      const existing = message.reactions.find((r) => r.emoji === emoji);
      if (existing) {
        if (!existing.userIds.includes(me)) existing.userIds.push(me);
      } else {
        if (message.reactions.length >= CHAT_REACTIONS_PER_MESSAGE)
          throw new AppError(400, "That message has enough reactions");
        message.reactions.push({ emoji, userIds: [me] });
      }
      await message.save();
      await announceUpdate(chat, message);
      res.json({ status: true, message: "", data: { message: await serializeMessage(message) } });
    },
  );

  app.delete(
    "/api/chat/conversations/:conversationId/messages/:seq/reactions/:emoji",
    authenticateToken,
    validateParams(chatReactionParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const chat = await loadChat(req.params.conversationId as string, me);
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
        await announceUpdate(chat, message);
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

async function announceUpdate(
  chat: { _id: unknown; members: Array<{ user_id: string }> },
  message: Awaited<ReturnType<typeof loadMessage>>,
) {
  realtime.toUsers(memberIdsOf(chat), "chat:message_update", {
    conversationId: String(chat._id),
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
