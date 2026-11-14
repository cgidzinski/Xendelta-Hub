import type { ChatConversation } from "@shared/chat";
import type { Community, CommunityChannel, CommunityPermission } from "@shared/communities";

/**
 * A channel shown through the chat screen's own shape. The chat components (message list, composer, read marker) are
 * written for a conversation with members, so a channel is described as one: its people are the community's, its
 * name is the channel's, and the viewer's read position comes from their unread count.
 */
export function channelConversation(community: Community, channel: CommunityChannel, meId: string): ChatConversation {
  const readUpTo = Math.max(0, channel.seq - channel.unread);
  return {
    _id: channel._id,
    name: channel.name,
    members: community.members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      joinedAt: m.joinedAt,
      lastReadSeq: m.user_id === meId ? readUpTo : 0,
    })),
    people: community.people,
    seq: channel.seq,
    lastMessage: channel.lastMessage ?? null,
    unread: channel.unread,
    muted: channel.muted,
    createdAt: channel.createdAt,
  };
}

/** Whether the viewer holds a permission in the community (the owner holds them all). */
export const hasCommunityPermission = (community: Pick<Community, "permissions">, permission: CommunityPermission) =>
  community.permissions.includes(permission);

/** The colour of a person's highest role that has one, so their name can wear it. Empty when none. */
export function roleColorOf(community: Pick<Community, "members" | "roles">, userId: string): string {
  const member = community.members.find((m) => m.user_id === userId);
  if (!member) return "";
  const held = new Set(member.roleIds);
  const top = community.roles.filter((r) => held.has(r._id) && r.color).sort((a, b) => b.position - a.position)[0];
  return top?.color ?? "";
}

/** The channels grouped under their category headings, in sidebar order. Uncategorised channels come first. */
export function groupChannels(channels: CommunityChannel[]): Array<{ category: string; channels: CommunityChannel[] }> {
  const sorted = [...channels].sort((a, b) => a.position - b.position);
  const groups: Array<{ category: string; channels: CommunityChannel[] }> = [];
  for (const channel of sorted) {
    const existing = groups.find((g) => g.category === channel.category);
    if (existing) existing.channels.push(channel);
    else groups.push({ category: channel.category, channels: [channel] });
  }
  // A channel with no category sits above the headings.
  return groups.sort((a, b) => (a.category === "" ? -1 : b.category === "" ? 1 : 0));
}

/** The first channel to open: the first with something unread, otherwise the first one. */
export function firstChannel(channels: CommunityChannel[]): CommunityChannel | undefined {
  const sorted = [...channels].sort((a, b) => a.position - b.position);
  return sorted.find((c) => c.unread > 0 && !c.muted) ?? sorted[0];
}

/** Unread channels in a community (muted ones don't count), for the rail's dot. */
export const unreadChannelCount = (channels: CommunityChannel[]) =>
  channels.filter((c) => c.unread > 0 && !c.muted).length;
