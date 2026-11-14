import type { Community, CommunityPermission, CommunityRoleInfo } from "@shared/communities";

// What the server decides, mirrored here so the screen can hide or disable what would be refused. The server still
// checks every request (communities/policy.ts), so this is only about not offering what won't work.

/** How high a person ranks: the owner above everything, others by their highest role (0 with none). */
export function rankOf(community: Pick<Community, "members" | "roles">, userId: string): number {
  const member = community.members.find((m) => m.user_id === userId);
  if (!member) return -1;
  if (member.role === "owner") return Infinity;
  const held = new Set(member.roleIds);
  return Math.max(0, ...community.roles.filter((r) => held.has(r._id)).map((r) => r.position));
}

/** May the viewer change this role (or give it to people and take it away)? */
export function canManageRoleClient(
  community: Pick<Community, "members" | "roles" | "permissions" | "ownerId">,
  viewerId: string,
  role: Pick<CommunityRoleInfo, "everyone" | "position">,
): boolean {
  if (community.ownerId === viewerId) return true;
  return community.permissions.includes("manageRoles") && !role.everyone && role.position < rankOf(community, viewerId);
}

/** May the viewer give this permission to a role? Only ones they hold themselves. */
export const canGrantClient = (community: Pick<Community, "permissions">, permission: CommunityPermission) =>
  community.permissions.includes(permission);

/** How many people have a role (everyone has the everyone role). */
export const roleMemberCount = (
  community: Pick<Community, "members">,
  role: Pick<CommunityRoleInfo, "_id" | "everyone">,
) => (role.everyone ? community.members.length : community.members.filter((m) => m.roleIds.includes(role._id)).length);
