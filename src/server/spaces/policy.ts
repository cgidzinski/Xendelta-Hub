// What people may do in a space, in one place. Routes and the socket layer ask these questions and never decide for
// themselves.
//
//   The owner                  may do everything, in every channel
//   Anyone else                gets the union of the `everyone` role and the roles they were given
//   A channel                  can then allow or deny permissions for a role (shared/spaces.ts `ChannelOverride`)
//
// Resolution order for a channel: owner → the channel's override for `everyone` → the channel's overrides for the
// person's other roles (every deny, then every allow). A deny from any of those roles wins over the base permissions.
import type { ChannelOverride, SpacePermission, SpaceRole } from "@shared/spaces";
import { CHANNEL_PERMISSIONS, SPACE_PERMISSIONS } from "@shared/spaces";

export interface SpaceRoleLike {
  _id: unknown;
  permissions: readonly string[];
  everyone?: boolean | null;
  position?: number | null;
}
export interface SpaceMemberLike {
  user_id: string;
  role?: string | null;
  roleIds?: readonly string[] | null;
}
export interface SpaceLike {
  members: readonly SpaceMemberLike[];
  roles: readonly SpaceRoleLike[];
}

const idOf = (v: unknown) => String(v);
const ALL: ReadonlySet<SpacePermission> = new Set(SPACE_PERMISSIONS);
const CHANNEL_SCOPED: ReadonlySet<SpacePermission> = new Set(CHANNEL_PERMISSIONS);

export const memberOf = (space: SpaceLike, userId: string) => space.members.find((m) => m.user_id === userId) ?? null;
export const isSpaceMember = (space: SpaceLike, userId: string) => memberOf(space, userId) !== null;
export const roleInSpace = (space: SpaceLike, userId: string): SpaceRole | null => {
  const member = memberOf(space, userId);
  return member ? (member.role === "owner" ? "owner" : "member") : null;
};
export const isSpaceOwner = (space: SpaceLike, userId: string) => roleInSpace(space, userId) === "owner";

const known = (list: readonly string[]): SpacePermission[] =>
  list.filter((p): p is SpacePermission => (ALL as ReadonlySet<string>).has(p));

/** The permissions a person has across the space, before any channel changes them. Empty for a non-member. */
export function spacePermissions(space: SpaceLike, userId: string): Set<SpacePermission> {
  const member = memberOf(space, userId);
  if (!member) return new Set();
  if (member.role === "owner") return new Set(ALL);
  const given = new Set((member.roleIds ?? []).map(String));
  const granted = new Set<SpacePermission>();
  for (const role of space.roles) {
    if (role.everyone || given.has(idOf(role._id))) known(role.permissions).forEach((p) => granted.add(p));
  }
  return granted;
}

/** The permissions a person has in one channel: the space's, changed by the channel's overrides. */
export function channelPermissions(
  space: SpaceLike,
  userId: string,
  overrides: readonly ChannelOverride[] = [],
): Set<SpacePermission> {
  const member = memberOf(space, userId);
  if (!member) return new Set();
  if (member.role === "owner") return new Set(ALL);
  const permissions = spacePermissions(space, userId);
  if (overrides.length === 0) return permissions;

  const apply = (matching: readonly ChannelOverride[]) => {
    for (const o of matching) known(o.deny).forEach((p) => CHANNEL_SCOPED.has(p) && permissions.delete(p));
    for (const o of matching) known(o.allow).forEach((p) => CHANNEL_SCOPED.has(p) && permissions.add(p));
  };
  const everyoneId = space.roles.find((r) => r.everyone)?._id;
  const given = new Set((member.roleIds ?? []).map(String));
  apply(overrides.filter((o) => everyoneId !== undefined && o.roleId === idOf(everyoneId)));
  apply(overrides.filter((o) => given.has(o.roleId)));
  return permissions;
}

/** Whether `userId` holds `permission` in the space (or, with `overrides`, in a channel of it). */
export function hasPermission(
  space: SpaceLike,
  userId: string,
  permission: SpacePermission,
  overrides?: readonly ChannelOverride[],
): boolean {
  return channelPermissions(space, userId, overrides).has(permission);
}

// ---- Roles: who may change which ----------------------------------------------------------------------------------
// Roles are ranked by `position` (higher is above). Someone with manage roles may only change roles ranked below their
// own highest role, and may only hand out permissions they hold themselves, so nobody can promote themselves past
// their own rank. The owner is above every rank.

/** How high a person ranks: the owner above everything, others by their highest role (0 with none). */
export function rankOf(space: SpaceLike, userId: string): number {
  const member = memberOf(space, userId);
  if (!member) return -1;
  if (member.role === "owner") return Infinity;
  const held = new Set((member.roleIds ?? []).map(String));
  return Math.max(0, ...space.roles.filter((r) => held.has(idOf(r._id))).map((r) => r.position ?? 0));
}

/** May the person edit this role (its name, colour, permissions, place) or give it to people and take it away? */
export function canManageRole(space: SpaceLike, actor: string, role: SpaceRoleLike): boolean {
  if (isSpaceOwner(space, actor)) return true;
  return hasPermission(space, actor, "manageRoles") && !role.everyone && (role.position ?? 0) < rankOf(space, actor);
}

/** May the person give these permissions to a role? Only ones they hold themselves (the owner holds all). */
export function canGrantPermissions(space: SpaceLike, actor: string, permissions: readonly string[]): boolean {
  const mine = spacePermissions(space, actor);
  return permissions.every((p) => (mine as ReadonlySet<string>).has(p));
}
