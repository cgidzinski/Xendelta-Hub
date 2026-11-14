import type { Application, Request, Response } from "express";
import { Message } from "../../models/message";
import { authenticateToken } from "../../middleware/auth";
import { audienceOf } from "../../chat/access";
import { canDeleteChatMessage, canPostChat } from "../../chat/policy";
import { appendMessage, loadChatContext, publishMessage, serializeMessage } from "../../chat/service";
import { realtime } from "../../realtime";
import { AppError, callerId, loadCaller } from "../../utils/http";
import {
  validate,
  validateParams,
  chatConversationParamSchema,
  chatMessageParamSchema,
  createPollSchema,
  pollVoteSchema,
} from "../../utils/validation";
import { isPollClosed } from "@shared/chat";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

async function loadPoll(chatId: unknown, seq: string) {
  const message = await Message.findOne({ conversationId: chatId, seq: Number(seq), kind: "poll" }).exec();
  if (!message || message.deletedAt || !message.poll?.options) throw new AppError(404, "Poll not found");
  return message;
}

const closedNow = (message: Awaited<ReturnType<typeof loadPoll>>) =>
  isPollClosed({
    endsAt: message.poll?.endsAt?.toISOString() ?? null,
    closedAt: message.poll?.closedAt?.toISOString() ?? null,
  });

/** Tell the people who can read the chat that a poll's votes (or its state) changed. */
async function announce(
  context: Awaited<ReturnType<typeof loadChatContext>>,
  message: Awaited<ReturnType<typeof loadPoll>>,
) {
  realtime.toUsers(audienceOf(context), "chat:message_update", {
    conversationId: String(context.chat._id),
    message: await serializeMessage(message),
  });
}

// Polls: a message with a question and 2 to 10 options. Anyone who can post in the chat votes, and may change their vote
// until it closes (by its end time, or when its creator or a moderator closes it).
export function registerPollRoutes(app: Application) {
  app.post(
    "/api/chat/conversations/:conversationId/polls",
    authenticateToken,
    validateParams(chatConversationParamSchema),
    validate(createPollSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      if (!canPostChat(context.access, me)) throw new AppError(403, "You can't post here");
      const input = createPollSchema.parse(req.body);
      const message = await appendMessage(context.chat, {
        from: me,
        kind: "poll",
        body: input.question,
        poll: {
          multiple: input.multiple,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
          options: input.options.map((text, i) => ({ id: String(i), text })),
        },
      });
      await publishMessage(context, message, (await loadCaller(req)).username ?? "Someone");
      ok(res, { message: await serializeMessage(message) });
    },
  );

  // Choose options (replacing what you chose before), or an empty list to take your vote back.
  app.put(
    "/api/chat/conversations/:conversationId/messages/:seq/poll/vote",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    validate(pollVoteSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      if (!canPostChat(context.access, me)) throw new AppError(403, "You can't vote here");
      const poll = await loadPoll(context.chat._id, req.params.seq as string);
      if (closedNow(poll)) throw new AppError(409, "This poll has closed");
      const chosen = [...new Set(pollVoteSchema.parse(req.body).optionIds)];
      const valid = new Set((poll.poll?.options ?? []).map((o) => o.id));
      if (chosen.some((id) => !valid.has(id))) throw new AppError(400, "That option isn't in this poll");
      if (!poll.poll!.multiple && chosen.length > 1) throw new AppError(400, "Choose one option");

      // Your earlier choices come off every option, the new ones go on.
      await Message.updateOne({ _id: poll._id }, { $pull: { "poll.options.$[].userIds": me } }).exec();
      if (chosen.length > 0) {
        await Message.updateOne(
          { _id: poll._id },
          { $addToSet: { "poll.options.$[o].userIds": me } },
          { arrayFilters: [{ "o.id": { $in: chosen } }] },
        ).exec();
      }
      const fresh = await loadPoll(context.chat._id, req.params.seq as string);
      await announce(context, fresh);
      ok(res, { message: await serializeMessage(fresh) });
    },
  );

  // Close it early. Its creator may, and so may anyone who can delete messages here.
  app.post(
    "/api/chat/conversations/:conversationId/messages/:seq/poll/close",
    authenticateToken,
    validateParams(chatMessageParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const context = await loadChatContext(req.params.conversationId as string, me);
      const poll = await loadPoll(context.chat._id, req.params.seq as string);
      if (!canDeleteChatMessage(context.access, poll, me)) throw new AppError(403, "You can't close this poll");
      if (!closedNow(poll)) {
        poll.set("poll.closedAt", new Date());
        await poll.save();
        await announce(context, poll);
      }
      ok(res, { message: await serializeMessage(poll) });
    },
  );
}
