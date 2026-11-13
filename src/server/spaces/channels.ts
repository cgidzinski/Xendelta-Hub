// Channels: the conversations that belong to a space. This file has no dependency on chat/service.ts (which imports it
// for the unread badge), so it only talks to the models and the policy.
import { Types } from "mongoose";
import { ChannelState } from "../models/channelState";
import { Conversation, type ConversationDocument } from "../models/conversation";
import { Message } from "../models/message";
import { Space, type SpaceDocument } from "../models/space";
import { AppError } from "../utils/http";
import { hasPermission } from "./policy";
import type { ChannelOverride, SpaceChannel } from "@shared/spaces";

type StateLike = { lastReadSeq?: number | null; mutedUntil?: Date | null } | undefined;

export const channelOverrides = (channel: { overrides?: ArrayLike<unknown> | null }): ChannelOverride[] =>
  Array.from((channel.overrides ?? []) as ArrayLike<ChannelOverride>, (o) => ({
    roleId: String(o.roleId),
    allow: [...o.allow],
    deny: [...o.deny],
  }));

/** Whether the person may see this channel at all (and so may be told it exists). */
export const canSeeChannel = (space: SpaceDocument, channel: ConversationDocument, userId: string) =>
  hasPermission(space, userId, "readMessages", channelOverrides(channel));

/** A channel of this space. A channel of another space, or a DM, is a 404 whatever its id. */
export async function loadChannel(space: SpaceDocument, channelId: string): Promise<ConversationDocument> {
  const channel = await Conversation.findOne({ _id: channelId, spaceId: String(space._id) }).exec();
  if (!channel) throw new AppError(404, "Channel not found");
  return channel;
}

const isMutedNow = (state: StateLike, now = Date.now()) => !!state?.mutedUntil && state.mutedUntil.getTime() > now;

export function serializeChannel(channel: ConversationDocument, state: StateLike): SpaceChannel {
  const last = channel.lastMessage;
  const seq = channel.seq ?? 0;
  return {
    _id: String(channel._id),
    spaceId: channel.spaceId ?? "",
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
    createdAt: (channel.createdAt ?? new Date(0)).toISOString(),
  };
}

/** The space's channels that `userId` may see, in sidebar order, with their own unread and mute state. */
export async function listChannels(space: SpaceDocument, userId: string): Promise<SpaceChannel[]> {
  const all = await Conversation.find({ spaceId: String(space._id) })
    .sort({ "channel.position": 1, _id: 1 })
    .exec();
  const visible = all.filter((c) => canSeeChannel(space, c, userId));
  const states = await ChannelState.find({ userId, conversationId: { $in: visible.map((c) => c._id) } })
    .lean()
    .exec();
  const byChannel = new Map(states.map((s) => [String(s.conversationId), s]));
  return visible.map((c) => serializeChannel(c, byChannel.get(String(c._id))));
}

export interface NewChannel {
  name: string;
  topic?: string;
  category?: string;
}

/** Add a channel at the end of the list. */
export async function createChannel(space: SpaceDocument, input: NewChannel): Promise<ConversationDocument> {
  const spaceId = String(space._id);
  const last = await Conversation.findOne({ spaceId }, "channel.position").sort({ "channel.position": -1 }).lean();
  const id = new Types.ObjectId();
  return Conversation.create({
    _id: id,
    name: input.name,
    spaceId,
    // Unique and never a roster of people, so no DM lookup can ever match a channel.
    rosterKey: `space:${spaceId}:${id}`,
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

/** How many channels the person can see that have something unread (muted ones don't count). */
export async function unreadChannelCount(userId: string): Promise<number> {
  const spaces = await Space.find({ "members.user_id": userId }).exec();
  if (spaces.length === 0) return 0;
  const spaceById = new Map(spaces.map((s) => [String(s._id), s]));
  const channels = await Conversation.find(
    { spaceId: { $in: [...spaceById.keys()] }, "lastMessage.at": { $exists: true } },
    { seq: 1, spaceId: 1, overrides: 1 },
  ).exec();
  const states = await ChannelState.find({ userId, conversationId: { $in: channels.map((c) => c._id) } })
    .lean()
    .exec();
  const byChannel = new Map(states.map((s) => [String(s.conversationId), s]));
  const now = Date.now();
  return channels.filter((c) => {
    const space = spaceById.get(c.spaceId ?? "");
    const state = byChannel.get(String(c._id));
    return (
      !!space && canSeeChannel(space, c, userId) && (c.seq ?? 0) > (state?.lastReadSeq ?? 0) && !isMutedNow(state, now)
    );
  }).length;
}

/** Delete every channel of a space (when the space is deleted). */
export async function deleteChannelsOf(spaceId: string): Promise<void> {
  const ids = (await Conversation.find({ spaceId }, "_id").lean().exec()).map((c) => c._id);
  if (ids.length === 0) return;
  await Message.deleteMany({ conversationId: { $in: ids } }).exec();
  await ChannelState.deleteMany({ conversationId: { $in: ids } }).exec();
  await Conversation.deleteMany({ _id: { $in: ids } }).exec();
}
