import { Space, type SpaceDocument } from "../models/space";
import { AppError } from "../utils/http";
import { loadPeople } from "../chat/service";
import { realtime } from "../realtime";
import { deleteChannelsOf } from "./channels";
import { spacePermissions } from "./policy";
import type { ChatPerson } from "@shared/chat";
import type { Space as SpaceWire } from "@shared/spaces";

/** The space, if `userId` is in it. Anyone else gets a 404, so ids can't be probed. */
export async function loadSpace(spaceId: string, userId: string): Promise<SpaceDocument> {
  const space = await Space.findOne({ _id: spaceId, "members.user_id": userId }).exec();
  if (!space) throw new AppError(404, "Space not found");
  return space;
}

export const spaceMemberIds = (space: { members: Array<{ user_id: string }> }) => space.members.map((m) => m.user_id);

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : new Date(0).toISOString());

export function serializeSpace(space: SpaceDocument, viewerId: string, people: Map<string, ChatPerson>): SpaceWire {
  const owner = space.members.find((m) => m.role === "owner");
  return {
    _id: String(space._id),
    name: space.name,
    icon: space.icon ?? null,
    ownerId: owner?.user_id ?? "",
    members: space.members.map((m) => ({
      user_id: m.user_id,
      role: m.role === "owner" ? "owner" : "member",
      roleIds: [...(m.roleIds ?? [])],
      joinedAt: iso(m.joinedAt),
    })),
    people: space.members.map((m) => people.get(m.user_id)).filter((p): p is ChatPerson => !!p),
    roles: [...space.roles]
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
      .map((r) => ({
        _id: String(r._id),
        name: r.name,
        color: r.color ?? "",
        position: r.position ?? 0,
        permissions: [...r.permissions],
        everyone: !!r.everyone,
      })),
    permissions: [...spacePermissions(space, viewerId)],
    createdAt: iso(space.createdAt),
  };
}

/** The space as `viewerId` sees it, with its members' public info. */
export async function presentSpace(space: SpaceDocument, viewerId: string): Promise<SpaceWire> {
  return serializeSpace(space, viewerId, await loadPeople(spaceMemberIds(space)));
}

/** Tell everyone in the space (and anyone just removed from it) that it changed, so their lists refetch. */
export function announceSpace(space: SpaceDocument, removed: string[] = []) {
  const id = String(space._id);
  realtime.toUsers(
    spaceMemberIds(space).filter((u) => !removed.includes(u)),
    "space:updated",
    { spaceId: id },
  );
  if (removed.length > 0) realtime.toUsers(removed, "space:updated", { spaceId: id, removed: true });
}

/** Delete a space with its channels and their messages. */
export async function deleteSpace(space: SpaceDocument): Promise<void> {
  await deleteChannelsOf(String(space._id));
  await Space.deleteOne({ _id: space._id }).exec();
}
