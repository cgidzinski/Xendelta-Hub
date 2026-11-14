import { Message } from "../models/message";

/**
 * How many unread messages mention `userId` (or everyone), for each of these channels. `lastReadSeq` is how far the
 * person has read in each. Only the unread part of each channel is looked at.
 */
export async function mentionCounts(
  userId: string,
  channels: Array<{ id: string; lastReadSeq: number }>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (channels.length === 0) return counts;
  const found = await Message.find(
    {
      $or: channels.map((c) => ({ conversationId: c.id, seq: { $gt: c.lastReadSeq } })),
      $and: [{ $or: [{ mentions: userId }, { mentionsEveryone: true }] }],
      deletedAt: { $exists: false },
      from: { $ne: userId },
    },
    "conversationId",
  )
    .lean()
    .exec();
  for (const m of found) counts.set(String(m.conversationId), (counts.get(String(m.conversationId)) ?? 0) + 1);
  return counts;
}
