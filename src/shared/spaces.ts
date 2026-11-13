// Space wire types and limits, shared by the server and the client.
//
// A space is a place for a group, like a Discord server: it owns channels (conversations that belong to it), roles that
// say what people may do, and its own members. A DM or group chat is not in a space and keeps working as before.
import type { ChatPerson } from "./chat";

export const SPACE_NAME_MAX = 60;
export const SPACE_ROLE_NAME_MAX = 32;
export const SPACE_MAX_ROLES = 25;
export const SPACE_MAX_MEMBERS = 500;
export const SPACE_MAX_SPACES_PER_USER = 50;
export const SPACE_CHANNEL_NAME_MAX = 50;
export const SPACE_CHANNEL_TOPIC_MAX = 200;
export const SPACE_CATEGORY_MAX = 40;
export const SPACE_MAX_CHANNELS = 100;
/** The channel every new space starts with. */
export const DEFAULT_CHANNEL_NAME = "general";

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

/** The permissions a channel can allow or deny for a role. Running the space itself is never a channel matter. */
export const CHANNEL_PERMISSIONS: readonly SpacePermission[] = SPACE_PERMISSIONS.filter(
  (p) => p !== "manageSpace" && p !== "manageRoles" && p !== "manageChannels",
);

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
  /** Public info for the current members. */
  people: ChatPerson[];
  roles: SpaceRoleInfo[];
  /** What the person asking may do across the space (channels can change this for them). */
  permissions: SpacePermission[];
  createdAt: string;
}

/** A text channel: a conversation that belongs to a space. Its messages are ordinary chat messages (`seq`, `ChatMessage`). */
export interface SpaceChannel {
  _id: string;
  spaceId: string;
  name: string;
  topic: string;
  /** The heading it sits under in the sidebar; empty for none. */
  category: string;
  /** Lower comes first. */
  position: number;
  /** The number of the newest message. */
  seq: number;
  lastMessage?: { seq: number; from: string | null; preview: string; at: string } | null;
  /** Messages the caller has not read. */
  unread: number;
  muted: boolean;
  /** Who this channel is closed to, or open only to. Empty means it follows the space's roles. */
  overrides: ChannelOverride[];
  createdAt: string;
}
