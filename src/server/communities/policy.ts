// What people may do in a community, in one place. Routes and the socket layer ask these questions and never decide for
// themselves.
//
//   The owner                  may do everything, in every channel
//   Anyone else                gets the union of the `everyone` role and the roles they were given
//   A channel                  can then allow or deny permissions for a role (shared/communities.ts `ChannelOverride`)
//
// Resolution order for a channel: owner → the channel's override for `everyone` → the channel's overrides for the
// person's other roles (every deny, then every allow). A deny from any of those roles wins over the base permissions.
import type { ChannelOverride, CommunityPermission, CommunityRole } from "@shared/communities";
import { CHANNEL_PERMISSIONS, COMMUNITY_PERMISSIONS } from "@shared/communities";

export interface CommunityRoleLike {
  _id: unknown;
  permissions: readonly string[];
  everyone?: boolean | null;
  position?: number | null;
}
export interface CommunityMemberLike {
  user_id: string;
  role?: string | null;
  roleIds?: readonly string[] | null;
}
export interface CommunityLike {
  members: readonly CommunityMemberLike[];
  roles: readonly CommunityRoleLike[];
}

const idOf = (v: unknown) => String(v);
const ALL: ReadonlySet<CommunityPermission> = new Set(COMMUNITY_PERMISSIONS);
const CHANNEL_SCOPED: ReadonlySet<CommunityPermission> = new Set(CHANNEL_PERMISSIONS);

export const memberOf = (community: CommunityLike, userId: string) =>
  community.members.find((m) => m.user_id === userId) ?? null;
export const isCommunityMember = (community: CommunityLike, userId: string) => memberOf(community, userId) !== null;
export const roleInCommunity = (community: CommunityLike, userId: string): CommunityRole | null => {
  const member = memberOf(community, userId);
  return member ? (member.role === "owner" ? "owner" : "member") : null;
};
export const isCommunityOwner = (community: CommunityLike, userId: string) =>
  roleInCommunity(community, userId) === "owner";

const known = (list: readonly string[]): CommunityPermission[] =>
  list.filter((p): p is CommunityPermission => (ALL as ReadonlySet<string>).has(p));

/** The permissions a person has across the community, before any channel changes them. Empty for a non-member. */
export function communityPermissions(community: CommunityLike, userId: string): Set<CommunityPermission> {
  const member = memberOf(community, userId);
  if (!member) return new Set();
  if (member.role === "owner") return new Set(ALL);
  const given = new Set((member.roleIds ?? []).map(String));
  const granted = new Set<CommunityPermission>();
  for (const role of community.roles) {
    if (role.everyone || given.has(idOf(role._id))) known(role.permissions).forEach((p) => granted.add(p));
  }
  return granted;
}

/** The permissions a person has in one channel: the community's, changed by the channel's overrides. */
export function channelPermissions(
  community: CommunityLike,
  userId: string,
  overrides: readonly ChannelOverride[] = [],
): Set<CommunityPermission> {
  const member = memberOf(community, userId);
  if (!member) return new Set();
  if (member.role === "owner") return new Set(ALL);
  const permissions = communityPermissions(community, userId);
  if (overrides.length === 0) return permissions;

  const apply = (matching: readonly ChannelOverride[]) => {
    for (const o of matching) known(o.deny).forEach((p) => CHANNEL_SCOPED.has(p) && permissions.delete(p));
    for (const o of matching) known(o.allow).forEach((p) => CHANNEL_SCOPED.has(p) && permissions.add(p));
  };
  const everyoneId = community.roles.find((r) => r.everyone)?._id;
  const given = new Set((member.roleIds ?? []).map(String));
  apply(overrides.filter((o) => everyoneId !== undefined && o.roleId === idOf(everyoneId)));
  apply(overrides.filter((o) => given.has(o.roleId)));
  return permissions;
}

/** Whether `userId` holds `permission` in the community (or, with `overrides`, in a channel of it). */
export function hasPermission(
  community: CommunityLike,
  userId: string,
  permission: CommunityPermission,
  overrides?: readonly ChannelOverride[],
): boolean {
  return channelPermissions(community, userId, overrides).has(permission);
}

// ---- Roles: who may change which ----------------------------------------------------------------------------------
// Roles are ranked by `position` (higher is above). Someone with manage roles may only change roles ranked below their
// own highest role, and may only hand out permissions they hold themselves, so nobody can promote themselves past
// their own rank. The owner is above every rank.

/** How high a person ranks: the owner above everything, others by their highest role (0 with none). */
export function rankOf(community: CommunityLike, userId: string): number {
  const member = memberOf(community, userId);
  if (!member) return -1;
  if (member.role === "owner") return Infinity;
  const held = new Set((member.roleIds ?? []).map(String));
  return Math.max(0, ...community.roles.filter((r) => held.has(idOf(r._id))).map((r) => r.position ?? 0));
}

/** May the person edit this role (its name, colour, permissions, place) or give it to people and take it away? */
export function canManageRole(community: CommunityLike, actor: string, role: CommunityRoleLike): boolean {
  if (isCommunityOwner(community, actor)) return true;
  return (
    hasPermission(community, actor, "manageRoles") && !role.everyone && (role.position ?? 0) < rankOf(community, actor)
  );
}

/** May the person give these permissions to a role? Only ones they hold themselves (the owner holds all). */
export function canGrantPermissions(community: CommunityLike, actor: string, permissions: readonly string[]): boolean {
  const mine = communityPermissions(community, actor);
  return permissions.every((p) => (mine as ReadonlySet<string>).has(p));
}
