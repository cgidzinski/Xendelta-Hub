// Space wire types and limits, shared by the server and the client.
//
// A space is a place for a group, like a Discord server: it owns channels (conversations that belong to it), roles that
// say what people may do, and its own members. A DM or group chat is not in a space and keeps working as before.

export const SPACE_NAME_MAX = 60;
export const SPACE_ROLE_NAME_MAX = 32;
export const SPACE_MAX_ROLES = 25;
export const SPACE_MAX_MEMBERS = 500;
export const SPACE_MAX_SPACES_PER_USER = 50;

/** What a person can be allowed to do in a space. A role is a list of these. */
export const SPACE_PERMISSIONS = [
  "readMessages",
  "sendMessages",
  "manageMessages",
  "pinMessages",
  "mentionEveryone",
  "invite",
  "kickMembers",
  "manageEmoji",
  "manageChannels",
  "manageRoles",
  "manageSpace",
] as const;
export type SpacePermission = (typeof SPACE_PERMISSIONS)[number];

/** What every member gets before any other role is added. */
export const DEFAULT_EVERYONE_PERMISSIONS: readonly SpacePermission[] = ["readMessages", "sendMessages", "invite"];

/** What people see as the name of the role everyone has. */
export const EVERYONE_ROLE_NAME = "everyone";

export type SpaceRole = "owner" | "member";

export interface SpaceRoleInfo {
  _id: string;
  name: string;
  /** A CSS hex colour such as "#5b8def", or empty for the default text colour. */
  color: string;
  /** Higher sits above lower. The everyone role is always at the bottom. */
  position: number;
  permissions: SpacePermission[];
  /** True for the role every member has; it can be edited but never deleted. */
  everyone: boolean;
}

export interface SpaceMember {
  user_id: string;
  role: SpaceRole;
  /** The ids of the extra roles this person has (not the everyone role, which all members have). */
  roleIds: string[];
  joinedAt: string;
}

/** A channel's allow/deny list for one role: the way a channel is made private or read-only. */
export interface ChannelOverride {
  roleId: string;
  allow: SpacePermission[];
  deny: SpacePermission[];
}

export interface Space {
  _id: string;
  name: string;
  /** The XenDrive file used as the icon, if any. */
  icon: string | null;
  ownerId: string;
  members: SpaceMember[];
  roles: SpaceRoleInfo[];
  createdAt: string;
}
