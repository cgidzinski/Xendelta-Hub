import { Types } from "mongoose";
import { Conversation, type ConversationDocument } from "../models/conversation";
import { Message, type MessageDocument } from "../models/message";
import { User } from "../models/user";
import { XenDriveFile } from "../models/xendriveFile";
import { AppError } from "../utils/http";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../utils/publicUser";
import { realtime } from "../realtime";
import { registerDriveSource } from "../utils/driveSources";
import { sendPushToUser } from "../utils/pushUtils";
import {
  CHAT_PREVIEW_MAX,
  chatTitle,
  rosterKeyOf,
  type ChatConversation,
  type ChatMessage,
  type ChatPerson,
  type ChatSystemEvent,
} from "@shared/chat";

const DEFAULT_AVATAR = "/avatars/default-avatar.png";

// ---------- loading ----------

/** The conversation, if `userId` is in it. Anyone else gets a 404, so ids can't be probed. */
export async function loadChat(conversationId: string, userId: string): Promise<ConversationDocument> {
  const chat = await Conversation.findOne({ _id: conversationId, "members.user_id": userId }).exec();
  if (!chat) throw new AppError(404, "Conversation not found");
  return chat;
}

export const memberIdsOf = (chat: { members: Array<{ user_id: string }> }) => chat.members.map((m) => m.user_id);

/** Public info for these people, by id. Unknown ids (deleted accounts) are simply missing. */
export async function loadPeople(ids: Iterable<string>): Promise<Map<string, ChatPerson>> {
  const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
  const users =
    valid.length > 0
      ? await User.find({ _id: { $in: valid } }, PUBLIC_USER_FIELDS)
          .lean()
          .exec()
      : [];
  return new Map(
    users.map((u) => [
      String(u._id),
      {
        _id: String(u._id),
        username: u.username ?? "Unknown",
        avatar: u.avatar || DEFAULT_AVATAR,
        cosmetics: cosmeticsOf(u),
      },
    ]),
  );
}

// ---------- shaping ----------

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const isMuted = (member: { mutedUntil?: Date | null } | undefined, now = Date.now()) =>
  !!member?.mutedUntil && member.mutedUntil.getTime() > now;

export function unreadIn(
  chat: { seq?: number | null; members: Array<{ user_id: string; lastReadSeq?: number | null }> },
  userId: string,
) {
  const mine = chat.members.find((m) => m.user_id === userId);
  return Math.max(0, (chat.seq ?? 0) - (mine?.lastReadSeq ?? 0));
}

export function serializeChat(
  chat: ConversationDocument,
  viewerId: string,
  people: Map<string, ChatPerson>,
): ChatConversation {
  const mine = chat.members.find((m) => m.user_id === viewerId);
  const last = chat.lastMessage;
  return {
    _id: String(chat._id),
    name: chat.name || null,
    members: chat.members.map((m) => ({
      user_id: m.user_id,
      role: m.role === "owner" ? "owner" : "member",
      joinedAt: iso(m.joinedAt) ?? new Date(0).toISOString(),
      lastReadSeq: m.lastReadSeq ?? 0,
    })),
    people: chat.members.map((m) => people.get(m.user_id)).filter((p): p is ChatPerson => !!p),
    seq: chat.seq ?? 0,
    lastMessage:
      last?.seq != null && last.at
        ? { seq: last.seq, from: last.from ?? null, preview: last.preview ?? "", at: last.at.toISOString() }
        : null,
    unread: unreadIn(chat, viewerId),
    muted: isMuted(mine),
    createdAt: iso(chat.createdAt) ?? new Date(0).toISOString(),
  };
}

/** Wire messages. Looks up, in one query, which attached XenDrive files still exist. */
export async function serializeMessages(messages: MessageDocument[]): Promise<ChatMessage[]> {
  const fileIds = [...new Set(messages.flatMap((m) => m.attachments.map((a) => String(a.fileId))))];
  const existing = new Set<string>();
  if (fileIds.length > 0) {
    const files = await XenDriveFile.find({ _id: { $in: fileIds } }, "_id")
      .lean()
      .exec();
    for (const f of files) existing.add(String(f._id));
  }
  return messages.map((m) => {
    const deleted = !!m.deletedAt;
    const system = m.system?.event
      ? { event: m.system.event as ChatSystemEvent, userIds: [...m.system.userIds], name: m.system.name ?? undefined }
      : undefined;
    return {
      _id: String(m._id),
      conversationId: String(m.conversationId),
      seq: m.seq,
      from: m.from ?? null,
      kind: m.kind === "system" ? "system" : m.kind === "call" ? "call" : "text",
      body: deleted ? "" : (m.body ?? ""),
      system,
      attachments: deleted
        ? []
        : m.attachments.map((a) => ({
            fileId: String(a.fileId),
            name: a.name,
            mimeType: a.mimeType,
            size: a.size ?? 0,
            ...(existing.has(String(a.fileId)) ? {} : { removed: true }),
          })),
      replyTo: m.replyTo ?? null,
      reactions: deleted ? [] : m.reactions.map((r) => ({ emoji: r.emoji, userIds: [...r.userIds] })),
      createdAt: m.createdAt.toISOString(),
      editedAt: iso(m.editedAt),
      deletedAt: iso(m.deletedAt),
      clientId: m.clientId ?? null,
    };
  });
}

export async function serializeMessage(message: MessageDocument): Promise<ChatMessage> {
  return (await serializeMessages([message]))[0];
}

// ---------- sending ----------

function previewOf(body: string, attachmentCount: number, attachmentName?: string): string {
  const text = body.trim().replace(/\s+/g, " ");
  if (text) return text.length > CHAT_PREVIEW_MAX ? text.slice(0, CHAT_PREVIEW_MAX - 1).trimEnd() + "…" : text;
  if (attachmentCount === 1) return attachmentName ? `Sent ${attachmentName}` : "Sent a file";
  return attachmentCount > 1 ? `Sent ${attachmentCount} files` : "";
}

export interface NewMessage {
  from: string | null;
  kind?: "text" | "system";
  body?: string;
  system?: { event: ChatSystemEvent; userIds?: string[]; name?: string };
  attachments?: Array<{ fileId: string; name: string; mimeType: string; size: number }>;
  replyTo?: number;
  clientId?: string;
}

/**
 * Store a message: take the next number, write it, update the conversation's last message and the sender's read
 * position, and show the chat again to anyone who had hidden it. Does not tell anyone; see `publishMessage`.
 */
export async function appendMessage(chat: { _id: unknown }, input: NewMessage): Promise<MessageDocument> {
  const bumped = await Conversation.findByIdAndUpdate(
    chat._id,
    { $inc: { seq: 1 } },
    { new: true, projection: "seq" },
  ).exec();
  if (!bumped) throw new AppError(404, "Conversation not found");
  const seq = bumped.seq;

  const attachments = (input.attachments ?? []).map((a) => ({ ...a, fileId: new Types.ObjectId(a.fileId) }));
  const message = await Message.create({
    conversationId: chat._id,
    seq,
    from: input.from,
    kind: input.kind ?? "text",
    body: input.body ?? "",
    system: input.system && { event: input.system.event, userIds: input.system.userIds ?? [], name: input.system.name },
    attachments,
    replyTo: input.replyTo,
    clientId: input.clientId,
  });

  const preview =
    input.kind === "system"
      ? (input.body ?? "")
      : previewOf(input.body ?? "", attachments.length, attachments[0]?.name);
  // Only the newest message may set the last-message summary, so two sends racing can't leave an older one in it.
  await Conversation.updateOne(
    { _id: chat._id, $or: [{ "lastMessage.seq": { $lt: seq } }, { "lastMessage.seq": { $exists: false } }] },
    {
      $set: { lastMessage: { seq, from: input.from, preview, at: message.createdAt } },
      $unset: { "members.$[].hiddenAt": "" },
    },
  ).exec();
  if (input.from) {
    await Conversation.updateOne(
      { _id: chat._id },
      { $max: { "members.$[me].lastReadSeq": seq } },
      { arrayFilters: [{ "me.user_id": input.from }] },
    ).exec();
  }
  return message;
}

/** A line in the history that explains what happened to the chat. Tells the members it arrived. */
export async function postSystemMessage(
  chat: ConversationDocument,
  actorId: string,
  event: ChatSystemEvent,
  body: string,
  extra: { userIds?: string[]; name?: string } = {},
  notifyIds: string[] = memberIdsOf(chat),
): Promise<void> {
  const message = await appendMessage(chat, {
    from: null,
    kind: "system",
    body,
    system: { event, userIds: [actorId, ...(extra.userIds ?? [])], name: extra.name },
  });
  realtime.toUsers(notifyIds, "chat:message", {
    conversationId: String(chat._id),
    message: await serializeMessage(message),
  });
}

/** Tell the members about a stored message, and push to anyone who is not looking at the app. */
export async function publishMessage(chat: ConversationDocument, message: MessageDocument, senderName: string) {
  const wire = await serializeMessage(message);
  const conversationId = String(chat._id);
  realtime.toUsers(memberIdsOf(chat), "chat:message", { conversationId, message: wire });

  if (message.kind !== "text" || !message.from) return;
  const title = chat.name ? `${senderName} in ${chat.name}` : senderName;
  const body = previewOf(message.body ?? "", message.attachments.length, message.attachments[0]?.name);
  const now = Date.now();
  for (const member of chat.members) {
    if (member.user_id === message.from || isMuted(member, now) || realtime.isOnline(member.user_id)) continue;
    // One notification per conversation on the lock screen (the tag), and never a failed push breaking a send.
    void sendPushToUser(member.user_id, {
      title,
      body,
      url: `/internal/messages/${conversationId}`,
      tag: `chat-${conversationId}`,
    }).catch(() => undefined);
  }
}

// ---------- files ----------

// Attachments uploaded in a chat are XenDrive files tagged `source: { app: "chat", ref: <conversation id> }`: they count
// toward the sender's storage, stay out of My Drive, and show under XenDrive > From apps > Chat (utils/driveSources.ts).
registerDriveSource("chat", {
  label: "Chat",
  verify: async (userId, ref) =>
    Types.ObjectId.isValid(ref) && !!(await Conversation.exists({ _id: ref, "members.user_id": userId })),
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const chats =
      valid.length > 0 ? await Conversation.find({ _id: { $in: valid }, "members.user_id": userId }).exec() : [];
    const people = await loadPeople(chats.flatMap(memberIdsOf));
    const names = new Map(chats.map((c) => [String(c._id), chatTitle(serializeChat(c, userId, people), userId)]));
    // A chat the person has left (or that was deleted) keeps its files until they delete them.
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A chat you're no longer in"]));
  },
});

// ---------- ending ----------

/** A conversation ends when its last member leaves (or an admin clears everything). Attached files stay in XenDrive. */
export async function deleteChat(conversationId: unknown): Promise<void> {
  await Message.deleteMany({ conversationId }).exec();
  await Conversation.deleteOne({ _id: conversationId }).exec();
}

// ---------- unread ----------

/** How many of the person's conversations have unread messages (muted ones don't count). */
export async function unreadConversationCount(userId: string): Promise<number> {
  const chats = await Conversation.find(
    { "members.user_id": userId, "lastMessage.at": { $exists: true } },
    { seq: 1, "members.$": 1 },
  )
    .lean()
    .exec();
  const now = Date.now();
  return chats.filter((c) => {
    const me = c.members[0];
    return (c.seq ?? 0) > (me?.lastReadSeq ?? 0) && !isMuted(me, now);
  }).length;
}

export { rosterKeyOf };
