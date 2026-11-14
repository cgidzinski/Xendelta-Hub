import { Community, type CommunityDocument } from "../models/community";
import { CommunityInvite } from "../models/communityInvite";
import { AppError } from "../utils/http";
import { loadPeople } from "../chat/service";
import { realtime } from "../realtime";
import { deleteEmojiOf } from "../emoji/cleanup";
import { deleteChannelsOf, unreadChannelsByCommunity } from "./channels";
import { communityPermissions } from "./policy";
import type { ChatPerson } from "@shared/chat";
import type { Community as CommunityWire } from "@shared/communities";

/** The community, if `userId` is in it. Anyone else gets a 404, so ids can't be probed. */
export async function loadCommunity(communityId: string, userId: string): Promise<CommunityDocument> {
  const community = await Community.findOne({ _id: communityId, "members.user_id": userId }).exec();
  if (!community) throw new AppError(404, "Community not found");
  return community;
}

export const communityMemberIds = (community: { members: Array<{ user_id: string }> }) =>
  community.members.map((m) => m.user_id);

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : new Date(0).toISOString());

export function serializeCommunity(
  community: CommunityDocument,
  viewerId: string,
  people: Map<string, ChatPerson>,
  unreadChannels = 0,
): CommunityWire {
  const owner = community.members.find((m) => m.role === "owner");
  return {
    _id: String(community._id),
    name: community.name,
    icon: community.icon ?? null,
    ownerId: owner?.user_id ?? "",
    members: community.members.map((m) => ({
      user_id: m.user_id,
      role: m.role === "owner" ? "owner" : "member",
      roleIds: [...(m.roleIds ?? [])],
      joinedAt: iso(m.joinedAt),
    })),
    people: community.members.map((m) => people.get(m.user_id)).filter((p): p is ChatPerson => !!p),
    roles: [...community.roles]
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
      .map((r) => ({
        _id: String(r._id),
        name: r.name,
        color: r.color ?? "",
        position: r.position ?? 0,
        permissions: [...r.permissions],
        everyone: !!r.everyone,
      })),
    permissions: [...communityPermissions(community, viewerId)],
    unreadChannels,
    createdAt: iso(community.createdAt),
  };
}

/** The community as `viewerId` sees it, with its members' public info. */
export async function presentCommunity(community: CommunityDocument, viewerId: string): Promise<CommunityWire> {
  const [people, unread] = await Promise.all([
    loadPeople(communityMemberIds(community)),
    unreadChannelsByCommunity(viewerId),
  ]);
  return serializeCommunity(community, viewerId, people, unread.get(String(community._id)) ?? 0);
}

/** Tell everyone in the community (and anyone just removed from it) that it changed, so their lists refetch. */
export function announceCommunity(community: CommunityDocument, removed: string[] = []) {
  const id = String(community._id);
  realtime.toUsers(
    communityMemberIds(community).filter((u) => !removed.includes(u)),
    "community:updated",
    { communityId: id },
  );
  if (removed.length > 0) realtime.toUsers(removed, "community:updated", { communityId: id, removed: true });
}

/** Delete a community with its channels and their messages. */
export async function deleteCommunity(community: CommunityDocument): Promise<void> {
  await deleteChannelsOf(String(community._id));
  await deleteEmojiOf({ communityId: String(community._id) });
  await CommunityInvite.deleteMany({ communityId: String(community._id) }).exec();
  await Community.deleteOne({ _id: community._id }).exec();
}
