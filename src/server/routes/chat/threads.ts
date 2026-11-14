import type { Application, Request, Response } from "express";
import { Message } from "../../models/message";
import { authenticateToken } from "../../middleware/auth";
import { loadChatContext, loadPeople, serializeMessage, serializeMessages } from "../../chat/service";
import { AppError, callerId } from "../../utils/http";
import { validateParams, chatConversationParamSchema, chatMessageParamSchema } from "../../utils/validation";
import { CHAT_THREAD_PAGE } from "@shared/chat";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });
const THREADS_LISTED = 50;

/** The message a thread hangs off, in this chat. */
async function loadRoot(chatId: unknown, seq: string) {
  const root = await Message.findOne({ conversationId: chatId, seq: Number(seq) }).exec();
  if (!root || root.kind !== "text" || root.deletedAt || typeof root.threadRoot === "number") {
    throw new AppError(404, "Thread not found");
  }
  return root;
}

// Threads share the chat's access: anyone who can read the chat can read its threads, and anyone who can post can reply
// (replies are sent with the chat's own send route and `threadRoot`).
export function registerThreadRoutes(app: Application) {
  // The threads of a chat, most recently active first.
  app.get(
    "/api/chat/conversations/:conversationId/threads",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    async (req: Request, res: Response) => {
      const { chat } = await loadChatContext(req.params.conversationId as string, callerId(req));
      const roots = await Message.find({
        conversationId: chat._id,
        "thread.count": { $gt: 0 },
        deletedAt: { $exists: false },
      })
        .sort({ "thread.lastAt": -1 })
        .limit(THREADS_LISTED)
        .exec();
      const people = await loadPeople(roots.map((m) => m.from).filter((id): id is string => !!id));
      ok(res, { threads: await serializeMessages(roots), people: [...people.values()] });
    },
  );

  // One thread: its first message, the latest replies (oldest first), and whether the caller follows it.
  app.get(
    "/api/chat/conversations/:conversationId/messages/:seq/thread",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const { chat } = await loadChatContext(req.params.conversationId as string, me);
      const root = await loadRoot(chat._id, req.params.seq as string);
      const found = await Message.find({ conversationId: chat._id, threadRoot: root.seq })
        .sort({ seq: -1 })
        .limit(CHAT_THREAD_PAGE + 1)
        .exec();
      const replies = found.slice(0, CHAT_THREAD_PAGE).reverse();
      const people = await loadPeople([root, ...replies].map((m) => m.from).filter((id): id is string => !!id));
      ok(res, {
        root: await serializeMessage(root),
        replies: await serializeMessages(replies),
        hasMore: found.length > CHAT_THREAD_PAGE,
        following: (root.thread?.followers ?? []).includes(me),
        people: [...people.values()],
      });
    },
  );

  // Follow or stop following a thread: followers are the ones notified of replies.
  for (const [method, follow] of [
    ["put", true],
    ["delete", false],
  ] as const) {
    app[method](
      "/api/chat/conversations/:conversationId/messages/:seq/thread/follow",
      authenticateToken,
      validateParams(chatMessageParamSchema),
      async (req: Request, res: Response) => {
        const me = callerId(req);
        const { chat } = await loadChatContext(req.params.conversationId as string, me);
        const root = await loadRoot(chat._id, req.params.seq as string);
        await Message.updateOne(
          { _id: root._id },
          follow ? { $addToSet: { "thread.followers": me } } : { $pull: { "thread.followers": me } },
        ).exec();
        ok(res, { following: follow });
      },
    );
  }
}
