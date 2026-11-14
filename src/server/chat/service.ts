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
import { ChannelState } from "../models/channelState";
import { unreadChannelCount } from "../communities/channels";
import { audienceOf, resolveChatAccess, type ChatContext } from "./access";
import { canPostChat } from "./policy";
import { mentionNames } from "./mentions";
import { plainMessageText } from "@shared/messageText";
import { deleteEmojiOf } from "../emoji/cleanup";
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

/** The conversation for a request, if the caller may see it: a chat they are in, or a channel they can read. */
export async function loadChatContext(conversationId: string, userId: string): Promise<ChatContext> {
  const context = await resolveChatAccess(conversationId, userId);
  if (!context) throw new AppError(404, "Conversation not found");
  return context;
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
      gif:
        !deleted && m.gif?.url
          ? {
              url: m.gif.url,
              stillUrl: m.gif.stillUrl ?? m.gif.url,
              width: m.gif.width ?? 0,
              height: m.gif.height ?? 0,
              title: m.gif.title ?? "",
            }
          : null,
      threadRoot: m.threadRoot ?? null,
      thread:
        m.thread?.lastAt && (m.thread.count ?? 0) > 0
          ? { count: m.thread.count ?? 0, lastAt: iso(m.thread.lastAt), lastBy: m.thread.lastBy ?? null }
          : null,
      reactions: deleted ? [] : m.reactions.map((r) => ({ emoji: r.emoji, userIds: [...r.userIds] })),
      pinnedAt: deleted ? null : iso(m.pinnedAt),
      pinnedBy: deleted ? null : (m.pinnedBy ?? null),
      mentions: deleted ? [] : [...(m.mentions ?? [])],
      mentionsEveryone: deleted ? false : !!m.mentionsEveryone,
      mentionsHere: deleted ? false : !!m.mentionsHere,
      embeds: deleted
        ? []
        : m.embeds.map((e) => ({
            url: e.url,
            title: e.title ?? "",
            description: e.description ?? "",
            siteName: e.siteName ?? "",
          })),
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

function previewOf(
  rawBody: string,
  attachmentCount: number,
  attachmentName?: string,
  names?: ReadonlyMap<string, string>,
  hasGif = false,
): string {
  const body = plainMessageText(rawBody, names);
  const text = body.trim().replace(/\s+/g, " ");
  if (text) return text.length > CHAT_PREVIEW_MAX ? text.slice(0, CHAT_PREVIEW_MAX - 1).trimEnd() + "…" : text;
  if (hasGif) return "Sent a GIF";
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
  gif?: { url: string; stillUrl: string; width: number; height: number; title: string };
  /** A reply in the thread of this message (kept out of the main history). */
  threadRoot?: number;
  clientId?: string;
  /** Who the body mentions (see chat/mentions.ts resolveMentions). */
  mentions?: { userIds: string[]; everyone: boolean; here: boolean };
}

/**
 * Store a message: take the next number, write it, update the conversation's last message and the sender's read
 * position, and show the chat again to anyone who had hidden it. Does not tell anyone; see `publishMessage`.
 */
export async function appendMessage(chat: { _id: unknown }, input: NewMessage): Promise<MessageDocument> {
  const bumped = await Conversation.findByIdAndUpdate(
    chat._id,
    { $inc: { seq: 1 } },
    { new: true, projection: "seq communityId" },
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
    gif: input.gif,
    threadRoot: input.threadRoot,
    clientId: input.clientId,
    mentions: input.mentions?.userIds ?? [],
    mentionsEveryone: input.mentions?.everyone ?? false,
    mentionsHere: input.mentions?.here ?? false,
  });

  const preview =
    input.kind === "system"
      ? (input.body ?? "")
      : previewOf(
          input.body ?? "",
          attachments.length,
          attachments[0]?.name,
          await mentionNames(input.body ?? ""),
          !!input.gif,
        );
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
    // A channel has no member list: the sender's own read position is in ChannelState.
    if (bumped.communityId) {
      await ChannelState.updateOne(
        { userId: input.from, conversationId: chat._id },
        { $max: { lastReadSeq: seq } },
        { upsert: true },
      ).exec();
    }
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

/** Tell the readers about a stored message, and push to anyone who is not looking at the app. */
export async function publishMessage(context: ChatContext, message: MessageDocument, senderName: string) {
  const { chat, community } = context;
  const wire = await serializeMessage(message);
  const conversationId = String(chat._id);
  const audience = audienceOf(context);
  realtime.toUsers(audience, "chat:message", { conversationId, message: wire });

  if (message.kind !== "text" || !message.from) return;
  const body = previewOf(
    message.body ?? "",
    message.attachments.length,
    message.attachments[0]?.name,
    await mentionNames(message.body ?? ""),
    !!message.gif?.url,
  );
  const now = Date.now();

  // Who has silenced it: a chat member's own setting, or a channel's ChannelState.
  let silenced: Set<string>;
  let title: string;
  let url: string;
  if (community) {
    const states = await ChannelState.find({ conversationId: chat._id, mutedUntil: { $gt: new Date(now) } }, "userId")
      .lean()
      .exec();
    silenced = new Set(states.map((s) => s.userId));
    title = `${senderName} in #${chat.name ?? "channel"} · ${community.name}`;
    url = `/internal/communities/${community._id}/${conversationId}`;
  } else {
    silenced = new Set(chat.members.filter((m) => isMuted(m, now)).map((m) => m.user_id));
    title = chat.name ? `${senderName} in ${chat.name}` : senderName;
    url = `/internal/messages/${conversationId}`;
  }
  // Someone named in the message is told even if they have muted the chat; a message to everyone says so.
  const named = new Set(message.mentions ?? []);
  // A reply in a thread tells only the people following it (and anyone named), not the whole chat.
  const inThread = typeof message.threadRoot === "number";
  const followers = new Set<string>(
    inThread
      ? ((
          await Message.findOne({ conversationId: chat._id, seq: message.threadRoot }, "thread.followers").lean().exec()
        )?.thread?.followers ?? [])
      : [],
  );
  const where = community ? `#${chat.name ?? "channel"} · ${community.name}` : chat.name ? chat.name : "a chat";
  for (const userId of audience) {
    if (userId === message.from || realtime.isOnline(userId)) continue;
    const mentioned = named.has(userId);
    if (inThread && !followers.has(userId) && !mentioned && !message.mentionsEveryone) continue;
    if (silenced.has(userId) && !mentioned) continue;
    const heading = mentioned
      ? `${senderName} mentioned you in ${where}`
      : message.mentionsEveryone
        ? `${senderName} pinged everyone in ${where}`
        : inThread
          ? `${title} (thread)`
          : title;
    // One notification per conversation on the lock screen (the tag), and never a failed push breaking a send.
    void sendPushToUser(userId, { title: heading, body, url, tag: `chat-${conversationId}` }).catch(() => undefined);
  }
}

// ---------- files ----------

// Attachments uploaded in a chat are XenDrive files tagged `source: { app: "chat", ref: <conversation id> }`: they count
// toward the sender's storage, stay out of My Drive, and show under XenDrive > From apps > Chat (utils/driveSources.ts).
registerDriveSource("chat", {
  label: "Chat",
  // Chat attachments use the sender's storage, like a file uploaded to XenDrive.
  counts: async () => true,
  verify: async (userId, ref) => {
    if (!Types.ObjectId.isValid(ref)) return false;
    const context = await resolveChatAccess(ref, userId);
    return !!context && canPostChat(context.access, userId);
  },
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const chats =
      valid.length > 0 ? await Conversation.find({ _id: { $in: valid }, "members.user_id": userId }).exec() : [];
    const people = await loadPeople(chats.flatMap(memberIdsOf));
    const names = new Map(chats.map((c) => [String(c._id), chatTitle(serializeChat(c, userId, people), userId)]));
    // A channel is named after itself; a chat the person has left (or that was deleted) keeps its files until they
    // delete them.
    for (const ref of refs) {
      if (names.has(ref) || !Types.ObjectId.isValid(ref)) continue;
      const context = await resolveChatAccess(ref, userId);
      if (context?.community) names.set(ref, `#${context.chat.name ?? "channel"} · ${context.community.name}`);
    }
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A chat you're no longer in"]));
  },
});

// ---------- ending ----------

/** A conversation ends when its last member leaves (or an admin clears everything). Attached files stay in XenDrive. */
export async function deleteChat(conversationId: unknown): Promise<void> {
  await deleteEmojiOf({ conversationId: String(conversationId) });
  await Message.deleteMany({ conversationId }).exec();
  await Conversation.deleteOne({ _id: conversationId }).exec();
}

// ---------- unread ----------

/** How many of the person's conversations and community channels have unread messages (muted ones don't count). */
export async function unreadConversationCount(userId: string): Promise<number> {
  const chats = await Conversation.find(
    { "members.user_id": userId, "lastMessage.at": { $exists: true } },
    { seq: 1, "members.$": 1 },
  )
    .lean()
    .exec();
  const now = Date.now();
  const chatCount = chats.filter((c) => {
    const me = c.members[0];
    return (c.seq ?? 0) > (me?.lastReadSeq ?? 0) && !isMuted(me, now);
  }).length;
  return chatCount + (await unreadChannelCount(userId));
}

export { rosterKeyOf };
