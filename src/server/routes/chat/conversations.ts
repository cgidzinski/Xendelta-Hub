import type { Application, Request, Response } from "express";
import { ChannelState } from "../../models/channelState";
import { Conversation } from "../../models/conversation";
import { authenticateToken } from "../../middleware/auth";
import { canMessage } from "../../chat/policy";
import {
  loadChat,
  loadChatContext,
  loadPeople,
  memberIdsOf,
  postSystemMessage,
  serializeChat,
  unreadConversationCount,
  rosterKeyOf,
} from "../../chat/service";
import { realtime } from "../../realtime";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  validateQuery,
  chatConversationParamSchema,
  chatListQuerySchema,
  chatMeSchema,
  chatReadSchema,
  createChatSchema,
  renameChatSchema,
} from "../../utils/validation";

const FAR_FUTURE = new Date("9999-12-31T00:00:00Z");

export function registerConversationRoutes(app: Application) {
  // The caller's conversations, newest activity first. A chat with no messages yet is not listed.
  app.get(
    "/api/chat/conversations",
    authenticateToken,
    validateQuery(chatListQuerySchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const { cursor, limit = 30 } = chatListQuerySchema.parse(req.query);
      const chats = await Conversation.find({
        members: { $elemMatch: { user_id: me, hiddenAt: null } },
        "lastMessage.at": cursor ? { $lt: new Date(cursor) } : { $exists: true },
      })
        .sort({ "lastMessage.at": -1 })
        .limit(limit + 1)
        .exec();

      const hasMore = chats.length > limit;
      const page = chats.slice(0, limit);
      const people = await loadPeople(page.flatMap(memberIdsOf));
      const last = page[page.length - 1]?.lastMessage?.at;
      res.json({
        status: true,
        message: "",
        data: {
          conversations: page.map((c) => serializeChat(c, me, people)),
          nextCursor: hasMore && last ? last.toISOString() : null,
        },
      });
    },
  );

  // How many conversations have something unread (for the badge).
  app.get("/api/chat/unread", authenticateToken, async (req: Request, res: Response) => {
    res.json({ status: true, message: "", data: { count: await unreadConversationCount(callerId(req)) } });
  });

  // Start a chat with these people. With one other person and no name this finds the chat you already have with
  // them (their DM), so "Message Alex" always opens the same thread; anything else creates a new group.
  app.post(
    "/api/chat/conversations",
    authenticateToken,
    validate(createChatSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const { userIds, name } = createChatSchema.parse(req.body);
      const others = [...new Set(userIds)].filter((id) => id !== me);
      if (others.length === 0) throw new AppError(400, "Pick at least one other person");

      const people = await loadPeople([me, ...others]);
      for (const id of others) {
        const person = people.get(id);
        if (!person) throw new AppError(404, "Someone you picked doesn't exist");
        if (!canMessage(me, id)) throw new AppError(403, `You can't message ${person.username}`);
      }

      const roster = [me, ...others];
      const rosterKey = rosterKeyOf(roster);

      if (!name && roster.length === 2) {
        const existing = await Conversation.findOne({ rosterKey, name: { $in: [null, ""] } })
          .sort({ createdAt: 1 })
          .exec();
        if (existing) {
          await Conversation.updateOne(
            { _id: existing._id },
            { $unset: { "members.$[me].hiddenAt": "" } },
            { arrayFilters: [{ "me.user_id": me }] },
          ).exec();
          const fresh = (await Conversation.findById(existing._id).exec())!;
          return res.json({
            status: true,
            message: "",
            data: { conversation: serializeChat(fresh, me, people), created: false },
          });
        }
      }

      const chat = await Conversation.create({
        name: name || undefined,
        rosterKey,
        members: [{ user_id: me, role: "owner" }, ...others.map((user_id) => ({ user_id, role: "member" as const }))],
      });

      // A group announces itself; a plain two-person chat just starts when someone writes.
      if (name || roster.length > 2) {
        await postSystemMessage(chat, me, "created", `${people.get(me)!.username} created the group`, { name });
      }
      realtime.toUsers(others, "chat:conversation", { conversationId: String(chat._id) });

      const fresh = (await Conversation.findById(chat._id).exec())!;
      res.json({ status: true, message: "", data: { conversation: serializeChat(fresh, me, people), created: true } });
    },
  );

  app.get(
    "/api/chat/conversations/:conversationId",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const chat = await loadChat(req.params.conversationId as string, me);
      const people = await loadPeople(memberIdsOf(chat));
      res.json({ status: true, message: "", data: { conversation: serializeChat(chat, me, people) } });
    },
  );

  // Rename. An empty name clears it, so the chat shows its members' names again.
  app.patch(
    "/api/chat/conversations/:conversationId",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validate(renameChatSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const { name } = renameChatSchema.parse(req.body);
      const chat = await loadChat(req.params.conversationId as string, me);
      if ((chat.name ?? "") === name) throw new AppError(400, "That's already the name");

      chat.set("name", name || undefined);
      await chat.save();
      const people = await loadPeople(memberIdsOf(chat));
      const who = people.get(me)?.username ?? "Someone";
      await postSystemMessage(
        chat,
        me,
        "renamed",
        name ? `${who} named the chat “${name}”` : `${who} removed the chat name`,
        {
          name: name || undefined,
        },
      );
      realtime.toUsers(memberIdsOf(chat), "chat:conversation", { conversationId: String(chat._id) });
      res.json({ status: true, message: "", data: { conversation: serializeChat(chat, me, people) } });
    },
  );

  // The caller's own settings for this chat: mute it, or hide it until the next message.
  app.patch(
    "/api/chat/conversations/:conversationId/me",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validate(chatMeSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const { muted, hidden } = chatMeSchema.parse(req.body);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const chat = context.chat;

      // A channel has no member entry to hold this: muting it is kept in the person's ChannelState.
      if (context.space) {
        if (muted !== undefined) {
          await ChannelState.updateOne(
            { userId: me, conversationId: chat._id },
            muted ? { $set: { mutedUntil: FAR_FUTURE } } : { $unset: { mutedUntil: "" } },
            { upsert: true },
          ).exec();
        }
        return res.json({ status: true, message: "", data: {} });
      }

      const set: Record<string, unknown> = {};
      const unset: Record<string, ""> = {};
      if (muted === true) set["members.$[me].mutedUntil"] = FAR_FUTURE;
      if (muted === false) unset["members.$[me].mutedUntil"] = "";
      if (hidden === true) set["members.$[me].hiddenAt"] = new Date();
      if (hidden === false) unset["members.$[me].hiddenAt"] = "";
      const update: Record<string, unknown> = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;
      if (Object.keys(update).length) {
        await Conversation.updateOne({ _id: chat._id }, update, { arrayFilters: [{ "me.user_id": me }] }).exec();
      }
      res.json({ status: true, message: "", data: {} });
    },
  );

  // "I have read up to here." Reading the newest message clears the unread count even if an earlier send left a gap.
  app.post(
    "/api/chat/conversations/:conversationId/read",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validate(chatReadSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const { seq } = chatReadSchema.parse(req.body);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const chat = context.chat;
      const newest = chat.lastMessage?.seq ?? 0;
      const upTo = seq >= newest ? chat.seq : Math.min(seq, chat.seq);
      if (context.space) {
        // A channel's read state is per person and private: only their own tabs hear about it.
        await ChannelState.updateOne(
          { userId: me, conversationId: chat._id },
          { $max: { lastReadSeq: upTo } },
          { upsert: true },
        ).exec();
        realtime.toUsers([me], "chat:read", { conversationId: String(chat._id), userId: me, seq: upTo });
        return res.json({ status: true, message: "", data: { lastReadSeq: upTo } });
      }
      await Conversation.updateOne(
        { _id: chat._id },
        { $max: { "members.$[me].lastReadSeq": upTo } },
        { arrayFilters: [{ "me.user_id": me }] },
      ).exec();
      realtime.toUsers(memberIdsOf(chat), "chat:read", { conversationId: String(chat._id), userId: me, seq: upTo });
      res.json({ status: true, message: "", data: { lastReadSeq: upTo } });
    },
  );
}
