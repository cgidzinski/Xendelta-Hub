// Chat rewrite (#175). Messages used to live inside each conversation document and each person's read state in
// users.conversations. Now:
//   * every message is its own document in `messages`, numbered 1..n per conversation (`seq`), in time order;
//   * a conversation holds `members` (the creator is the owner, everyone else a member) with each person's
//     `lastReadSeq`, plus `rosterKey`, `seq` and `lastMessage`;
//   * `participants`, `messages`, `createdBy` and users.conversations are removed.
// Everything is a conversation; a two-person one is a DM, so nothing is merged or renamed: existing chats between
// the same two people stay as they are, and "Message Alex" opens the oldest unnamed one.
//
// `up` is repeatable: messages are upserted by their old _id, and a conversation is only rewritten while it still
// has the old fields. `down` rebuilds the old shape; it is lossy for what the old model had no place for
// (reactions, attachments, edits, deleted messages and system messages).
import type { Connection } from "mongoose";
import { Types } from "mongoose";

const PREVIEW_MAX = 140;

const toDate = (value: unknown, fallback: Date): Date => {
  const d = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? fallback : d;
};
const preview = (text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > PREVIEW_MAX ? t.slice(0, PREVIEW_MAX - 1).trimEnd() + "…" : t;
};

export async function up(connection: Connection): Promise<void> {
  const conversations = connection.collection("conversations");
  const messages = connection.collection("messages");
  const users = connection.collection("users");

  await messages.createIndex({ conversationId: 1, seq: -1 }, { unique: true });
  await messages.createIndex(
    { conversationId: 1, clientId: 1 },
    { unique: true, partialFilterExpression: { clientId: { $type: "string" } } },
  );

  const old = conversations.find({ $or: [{ participants: { $exists: true } }, { messages: { $exists: true } }] });
  for await (const conv of old) {
    const created = (conv._id as Types.ObjectId).getTimestamp();
    const participants: string[] = [...new Set<string>((conv.participants ?? []).map(String))];
    if (participants.length === 0) {
      await messages.deleteMany({ conversationId: conv._id });
      await conversations.deleteOne({ _id: conv._id });
      continue;
    }

    // Time order, ties kept in their stored order.
    const stored: Array<Record<string, any>> = conv.messages ?? [];
    const ordered = stored
      .map((m, i) => ({ m, i, at: toDate(m.time, toDate(conv.updatedAt, created)) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.i - b.i);
    const seqByOldId = new Map<string, number>();
    ordered.forEach((x, n) => seqByOldId.set(String(x.m._id), n + 1));

    if (ordered.length > 0) {
      await messages.bulkWrite(
        ordered.map((x, n) => ({
          updateOne: {
            filter: { _id: x.m._id },
            update: {
              $setOnInsert: {
                conversationId: conv._id,
                seq: n + 1,
                from: x.m.from != null ? String(x.m.from) : null,
                kind: "text",
                body: String(x.m.message ?? ""),
                attachments: [],
                reactions: [],
                replyTo: x.m.parentMessageId ? seqByOldId.get(String(x.m.parentMessageId)) : undefined,
                createdAt: x.at,
              },
            },
            upsert: true,
          },
        })),
      );
    }
    const total = ordered.length;

    // Read positions from each person's old metadata.
    const objectIds = participants.filter((p) => Types.ObjectId.isValid(p)).map((p) => new Types.ObjectId(p));
    const owners = await users.find({ _id: { $in: objectIds } }, { projection: { conversations: 1 } }).toArray();
    const metaOf = new Map<string, Record<string, any> | undefined>(
      owners.map((u) => [
        String(u._id),
        (u.conversations ?? []).find((c: any) => String(c.conversationId) === String(conv._id)),
      ]),
    );
    const lastReadSeqOf = (userId: string): number => {
      const meta = metaOf.get(userId);
      if (!meta || meta.unread !== true) return total; // no metadata, or nothing unread
      if (meta.lastReadAt) {
        const readAt = toDate(meta.lastReadAt, new Date(0)).getTime();
        let upTo = 0;
        ordered.forEach((x, n) => {
          if (x.at.getTime() <= readAt) upTo = n + 1;
        });
        return upTo;
      }
      // Unread with no read time: they have read at least what they wrote themselves.
      let own = 0;
      ordered.forEach((x, n) => {
        if (String(x.m.from) === userId) own = n + 1;
      });
      return own;
    };

    const ownerId = participants.includes(String(conv.createdBy)) ? String(conv.createdBy) : participants[0];
    const members = participants.map((userId) => ({
      user_id: userId,
      role: userId === ownerId ? "owner" : "member",
      joinedAt: created,
      lastReadSeq: lastReadSeqOf(userId),
    }));
    const last = ordered[ordered.length - 1];

    await conversations.updateOne(
      { _id: conv._id },
      {
        $set: {
          members,
          rosterKey: [...participants].sort().join(","),
          seq: total,
          ...(last
            ? {
                lastMessage: {
                  seq: total,
                  from: last.m.from != null ? String(last.m.from) : null,
                  preview: preview(String(last.m.message ?? "")),
                  at: last.at,
                },
              }
            : {}),
          createdAt: created,
          updatedAt: toDate(conv.updatedAt, created),
        },
        $unset: { participants: "", messages: "", createdBy: "" },
      },
    );
  }

  await users.updateMany({ conversations: { $exists: true } }, { $unset: { conversations: "" } });

  await conversations.createIndex({ "members.user_id": 1, "lastMessage.at": -1 });
  await conversations.createIndex({ rosterKey: 1 });
  // The old participants index no longer applies.
  await conversations.dropIndex("participants_1").catch(() => undefined);
}

export async function down(connection: Connection): Promise<void> {
  const conversations = connection.collection("conversations");
  const messages = connection.collection("messages");
  const users = connection.collection("users");

  const current = conversations.find({ members: { $exists: true } });
  for await (const conv of current) {
    const rows = await messages
      .find({ conversationId: conv._id, kind: "text", deletedAt: { $exists: false } })
      .sort({ seq: 1 })
      .toArray();
    const idBySeq = new Map<number, unknown>(rows.map((r) => [r.seq as number, r._id]));
    const old = rows.map((r) => ({
      _id: r._id,
      from: r.from,
      message: r.body,
      time: r.createdAt,
      ...(r.replyTo != null && idBySeq.has(r.replyTo) ? { parentMessageId: String(idBySeq.get(r.replyTo)) } : {}),
    }));
    const members: Array<{ user_id: string; role: string; lastReadSeq?: number }> = conv.members ?? [];
    const owner = members.find((m) => m.role === "owner") ?? members[0];

    await conversations.updateOne(
      { _id: conv._id },
      {
        $set: { participants: members.map((m) => m.user_id), createdBy: owner?.user_id, messages: old },
        $unset: { members: "", rosterKey: "", seq: "", lastMessage: "" },
      },
    );

    for (const m of members) {
      if (!Types.ObjectId.isValid(m.user_id)) continue;
      const unread = (conv.seq ?? 0) > (m.lastReadSeq ?? 0);
      await users.updateOne(
        { _id: new Types.ObjectId(m.user_id) },
        { $push: { conversations: { conversationId: conv._id, unread, lastReadAt: new Date() } } as any },
      );
    }
  }
  await messages.deleteMany({});
  await conversations.dropIndex("members.user_id_1_lastMessage.at_-1").catch(() => undefined);
  await conversations.dropIndex("rosterKey_1").catch(() => undefined);
  await conversations.createIndex({ participants: 1 });
}
