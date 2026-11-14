// Threads: replies kept off the chat's main history, under the message that started them. A thread is not a chat of its
// own: its replies are messages of the same conversation (`threadRoot` = the number of the message they hang off), so
// who can read and post in it is exactly who can read and post in the chat, and nothing here can widen that.
import { Message } from "../models/message";
import { realtime } from "../realtime";
import { audienceOf, type ChatContext } from "./access";
import { serializeMessage } from "./service";
import type { MessageDocument } from "../models/message";

async function announceRoot(context: ChatContext, rootSeq: number) {
  const root = await Message.findOne({ conversationId: context.chat._id, seq: rootSeq }).exec();
  if (!root) return;
  realtime.toUsers(audienceOf(context), "chat:message_update", {
    conversationId: String(context.chat._id),
    message: await serializeMessage(root),
  });
}

/**
 * A reply was posted: count it on the root, remember when and by whom, make the replier follow the thread (and the
 * author of the root too, the first time), and tell the chat the root changed so its reply count moves live.
 */
export async function recordThreadReply(
  context: ChatContext,
  rootSeq: number,
  reply: MessageDocument,
  replierId: string,
): Promise<void> {
  const root = await Message.findOneAndUpdate(
    { conversationId: context.chat._id, seq: rootSeq },
    {
      $inc: { "thread.count": 1 },
      $set: { "thread.lastAt": reply.createdAt, "thread.lastBy": replierId },
      $addToSet: { "thread.followers": replierId },
    },
    { new: true },
  ).exec();
  if (!root) return;
  if (root.from && root.thread?.count === 1) {
    await Message.updateOne({ _id: root._id }, { $addToSet: { "thread.followers": root.from } }).exec();
  }
  await announceRoot(context, rootSeq);
}

/** A reply was deleted: the root's count goes down. */
export async function recordThreadReplyDeleted(context: ChatContext, rootSeq: number): Promise<void> {
  await Message.updateOne(
    { conversationId: context.chat._id, seq: rootSeq, "thread.count": { $gt: 0 } },
    { $inc: { "thread.count": -1 } },
  ).exec();
  await announceRoot(context, rootSeq);
}
