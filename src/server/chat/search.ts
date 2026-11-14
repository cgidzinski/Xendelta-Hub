// Message search. The one rule: a search only ever looks inside conversations the caller may read, and that set is
// worked out first (readableChats), so a filter or a guessed id can't widen it.
import { Conversation } from "../models/conversation";
import { Community } from "../models/community";
import { Message } from "../models/message";
import { canSeeChannel } from "../communities/channels";
import { serializeMessages } from "./service";
import { AppError } from "../utils/http";
import type { ChatSearchHas, ChatSearchResult } from "@shared/chat";

export interface ReadableChat {
  id: string;
  communityId: string | null;
  channelName: string | null;
}

/**
 * Every conversation `userId` may read: their DMs and group chats, and the channels they can read in the communities
 * they belong to. `conversationId` narrows to one of them (a 404 if it isn't), `communityId` to one community's channels.
 */
export async function readableChats(
  userId: string,
  scope: { conversationId?: string; communityId?: string } = {},
): Promise<ReadableChat[]> {
  const chats: ReadableChat[] = [];
  if (!scope.communityId) {
    const direct = await Conversation.find({ "members.user_id": userId, communityId: null }, "_id").lean().exec();
    for (const c of direct) chats.push({ id: String(c._id), communityId: null, channelName: null });
  }
  const communities = await Community.find({
    "members.user_id": userId,
    ...(scope.communityId ? { _id: scope.communityId } : {}),
  }).exec();
  if (scope.communityId && communities.length === 0) throw new AppError(404, "Community not found");
  for (const community of communities) {
    const channels = await Conversation.find({ communityId: String(community._id) }).exec();
    for (const channel of channels) {
      if (canSeeChannel(community, channel, userId)) {
        chats.push({ id: String(channel._id), communityId: String(community._id), channelName: channel.name ?? null });
      }
    }
  }
  if (!scope.conversationId) return chats;
  const one = chats.filter((c) => c.id === scope.conversationId);
  if (one.length === 0) throw new AppError(404, "Chat not found");
  return one;
}

export interface SearchInput {
  q?: string;
  from?: string;
  has?: ChatSearchHas;
  before?: string;
  after?: string;
  offset: number;
  limit: number;
}

/** Newest first. `hasMore` says whether another page follows. */
export async function searchMessages(
  chats: ReadableChat[],
  input: SearchInput,
): Promise<{ results: ChatSearchResult[]; hasMore: boolean }> {
  if (chats.length === 0) return { results: [], hasMore: false };
  const filter: Record<string, unknown> = {
    conversationId: { $in: chats.map((c) => c.id) },
    kind: { $in: ["text", "poll"] },
    deletedAt: { $exists: false },
  };
  if (input.q) filter.$text = { $search: input.q };
  if (input.from) filter.from = input.from;
  if (input.has === "attachment") filter["attachments.0"] = { $exists: true };
  if (input.has === "link") filter.body = { $regex: "https?://", $options: "i" };
  const created: Record<string, Date> = {};
  if (input.after) created.$gte = new Date(input.after);
  if (input.before) created.$lt = new Date(input.before);
  if (Object.keys(created).length > 0) filter.createdAt = created;

  const found = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(input.offset)
    .limit(input.limit + 1)
    .exec();
  const page = found.slice(0, input.limit);
  const where = new Map(chats.map((c) => [c.id, c]));
  const wire = await serializeMessages(page);
  return {
    hasMore: found.length > input.limit,
    results: wire.map((message) => ({
      message,
      communityId: where.get(message.conversationId)?.communityId ?? null,
      channelName: where.get(message.conversationId)?.channelName ?? null,
    })),
  };
}
