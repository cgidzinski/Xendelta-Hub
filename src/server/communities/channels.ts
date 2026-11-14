// Channels: the conversations that belong to a community. This file has no dependency on chat/service.ts (which imports it
// for the unread badge), so it only talks to the models and the policy.
import { Types } from "mongoose";
import { ChannelState } from "../models/channelState";
import { Conversation, type ConversationDocument } from "../models/conversation";
import { Message } from "../models/message";
import { Community, type CommunityDocument } from "../models/community";
import { AppError } from "../utils/http";
import { channelPermissions, hasPermission } from "./policy";
import type { ChannelOverride, CommunityChannel, CommunityPermission } from "@shared/communities";

type StateLike = { lastReadSeq?: number | null; mutedUntil?: Date | null } | undefined;

export const channelOverrides = (channel: { overrides?: ArrayLike<unknown> | null }): ChannelOverride[] =>
  Array.from((channel.overrides ?? []) as ArrayLike<ChannelOverride>, (o) => ({
    roleId: String(o.roleId),
    allow: [...o.allow],
    deny: [...o.deny],
  }));

/** Whether the person may see this channel at all (and so may be told it exists). */
export const canSeeChannel = (community: CommunityDocument, channel: ConversationDocument, userId: string) =>
  hasPermission(community, userId, "readMessages", channelOverrides(channel));

/** A channel of this community. A channel of another community, or a DM, is a 404 whatever its id. */
export async function loadChannel(community: CommunityDocument, channelId: string): Promise<ConversationDocument> {
  const channel = await Conversation.findOne({ _id: channelId, communityId: String(community._id) }).exec();
  if (!channel) throw new AppError(404, "Channel not found");
  return channel;
}

const isMutedNow = (state: StateLike, now = Date.now()) => !!state?.mutedUntil && state.mutedUntil.getTime() > now;

/** What `userId` may do in this channel (the community's permissions, changed by the channel's overrides). */
export const permissionsIn = (community: CommunityDocument, channel: ConversationDocument, userId: string) => [
  ...channelPermissions(community, userId, channelOverrides(channel)),
];

export function serializeChannel(
  channel: ConversationDocument,
  state: StateLike,
  permissions: CommunityPermission[],
): CommunityChannel {
  const last = channel.lastMessage;
  const seq = channel.seq ?? 0;
  return {
    _id: String(channel._id),
    communityId: channel.communityId ?? "",
    name: channel.name ?? "",
    topic: channel.channel?.topic ?? "",
    category: channel.channel?.category ?? "",
    position: channel.channel?.position ?? 0,
    seq,
    lastMessage:
      last?.seq != null && last.at
        ? { seq: last.seq, from: last.from ?? null, preview: last.preview ?? "", at: last.at.toISOString() }
        : null,
    unread: Math.max(0, seq - (state?.lastReadSeq ?? 0)),
    muted: isMutedNow(state),
    overrides: channelOverrides(channel),
    permissions,
    createdAt: (channel.createdAt ?? new Date(0)).toISOString(),
  };
}

/** The community's channels that `userId` may see, in sidebar order, with their own unread and mute state. */
export async function listChannels(community: CommunityDocument, userId: string): Promise<CommunityChannel[]> {
  const all = await Conversation.find({ communityId: String(community._id) })
    .sort({ "channel.position": 1, _id: 1 })
    .exec();
  const visible = all.filter((c) => canSeeChannel(community, c, userId));
  const states = await ChannelState.find({ userId, conversationId: { $in: visible.map((c) => c._id) } })
    .lean()
    .exec();
  const byChannel = new Map(states.map((s) => [String(s.conversationId), s]));
  return visible.map((c) => serializeChannel(c, byChannel.get(String(c._id)), permissionsIn(community, c, userId)));
}

export interface NewChannel {
  name: string;
  topic?: string;
  category?: string;
}

/** Add a channel at the end of the list. */
export async function createChannel(community: CommunityDocument, input: NewChannel): Promise<ConversationDocument> {
  const communityId = String(community._id);
  const last = await Conversation.findOne({ communityId }, "channel.position").sort({ "channel.position": -1 }).lean();
  const id = new Types.ObjectId();
  return Conversation.create({
    _id: id,
    name: input.name,
    communityId,
    // Unique and never a roster of people, so no DM lookup can ever match a channel.
    rosterKey: `community:${communityId}:${id}`,
    members: [],
    channel: {
      position: (last?.channel?.position ?? -1) + 1,
      category: input.category ?? "",
      topic: input.topic ?? "",
    },
  });
}

/** Delete a channel with its messages and everyone's read state for it. */
export async function deleteChannel(channelId: unknown): Promise<void> {
  await Message.deleteMany({ conversationId: channelId }).exec();
  await ChannelState.deleteMany({ conversationId: channelId }).exec();
  await Conversation.deleteOne({ _id: channelId }).exec();
}

/** How many channels the person can see that have something unread (muted ones don't count), by community id. */
export async function unreadChannelsByCommunity(userId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const communities = await Community.find({ "members.user_id": userId }).exec();
  if (communities.length === 0) return counts;
  const communityById = new Map(communities.map((s) => [String(s._id), s]));
  const channels = await Conversation.find(
    { communityId: { $in: [...communityById.keys()] }, "lastMessage.at": { $exists: true } },
    { seq: 1, communityId: 1, overrides: 1 },
  ).exec();
  const states = await ChannelState.find({ userId, conversationId: { $in: channels.map((c) => c._id) } })
    .lean()
    .exec();
  const byChannel = new Map(states.map((s) => [String(s.conversationId), s]));
  const now = Date.now();
  for (const c of channels) {
    const community = communityById.get(c.communityId ?? "");
    const state = byChannel.get(String(c._id));
    if (
      community &&
      canSeeChannel(community, c, userId) &&
      (c.seq ?? 0) > (state?.lastReadSeq ?? 0) &&
      !isMutedNow(state, now)
    ) {
      counts.set(String(community._id), (counts.get(String(community._id)) ?? 0) + 1);
    }
  }
  return counts;
}

/** How many channels, in all the person's communities, have something unread (muted ones don't count). */
export async function unreadChannelCount(userId: string): Promise<number> {
  return [...(await unreadChannelsByCommunity(userId)).values()].reduce((sum, n) => sum + n, 0);
}

/** Delete every channel of a community (when the community is deleted). */
export async function deleteChannelsOf(communityId: string): Promise<void> {
  const ids = (await Conversation.find({ communityId }, "_id").lean().exec()).map((c) => c._id);
  if (ids.length === 0) return;
  await Message.deleteMany({ conversationId: { $in: ids } }).exec();
  await ChannelState.deleteMany({ conversationId: { $in: ids } }).exec();
  await Conversation.deleteMany({ _id: { $in: ids } }).exec();
}
