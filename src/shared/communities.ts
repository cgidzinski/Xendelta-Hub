// Community wire types and limits, shared by the server and the client.
//
// A community is a place for a group, like a Discord server: it owns channels (conversations that belong to it), roles that
// say what people may do, and its own members. A DM or group chat is not in a community and keeps working as before.
import type { ChatPerson } from "./chat";

export const COMMUNITY_NAME_MAX = 60;
export const COMMUNITY_ROLE_NAME_MAX = 32;
export const COMMUNITY_MAX_ROLES = 25;
export const COMMUNITY_MAX_MEMBERS = 500;
/** People one person can invite to communities in an hour, so invites can't be used to spam. */
export const COMMUNITY_INVITES_PER_HOUR = 30;
export const COMMUNITY_MAX_INVITES_AT_ONCE = 20;
/** How long an invite stays open. */
export const COMMUNITY_INVITE_DAYS = 30;
export const COMMUNITY_MAX_COMMUNITIES_PER_USER = 50;
export const COMMUNITY_CHANNEL_NAME_MAX = 50;
export const COMMUNITY_CHANNEL_TOPIC_MAX = 200;
export const COMMUNITY_CATEGORY_MAX = 40;
export const COMMUNITY_MAX_CHANNELS = 100;
/** The channel every new community starts with. */
export const DEFAULT_CHANNEL_NAME = "general";

/** What a person can be allowed to do in a community. A role is a list of these. */
export const COMMUNITY_PERMISSIONS = [
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
  "manageCommunity",
] as const;
export type CommunityPermission = (typeof COMMUNITY_PERMISSIONS)[number];

/** The permissions a channel can allow or deny for a role. Running the community itself is never a channel matter. */
export const CHANNEL_PERMISSIONS: readonly CommunityPermission[] = COMMUNITY_PERMISSIONS.filter(
  (p) => p !== "manageCommunity" && p !== "manageRoles" && p !== "manageChannels",
);

/** The colours offered for a role. They read on a light page; the dark theme lightens them (see roleTextColor). */
export const ROLE_COLORS = ["#0f766e", "#7e22ce", "#b45309", "#1565c0", "#c62828", "#ad1457"] as const;

/** What every member gets before any other role is added. */
export const DEFAULT_EVERYONE_PERMISSIONS: readonly CommunityPermission[] = ["readMessages", "sendMessages", "invite"];

/** What people see as the name of the role everyone has. */
export const EVERYONE_ROLE_NAME = "everyone";

export type CommunityRole = "owner" | "member";

export interface CommunityRoleInfo {
  _id: string;
  name: string;
  /** A CSS hex colour such as "#5b8def", or empty for the default text colour. */
  color: string;
  /** Higher sits above lower. The everyone role is always at the bottom. */
  position: number;
  permissions: CommunityPermission[];
  /** True for the role every member has; it can be edited but never deleted. */
  everyone: boolean;
}

export interface CommunityMember {
  user_id: string;
  role: CommunityRole;
  /** The ids of the extra roles this person has (not the everyone role, which all members have). */
  roleIds: string[];
  joinedAt: string;
}

/** A channel's allow/deny list for one role: the way a channel is made private or read-only. */
export interface ChannelOverride {
  roleId: string;
  allow: CommunityPermission[];
  deny: CommunityPermission[];
}

export interface Community {
  _id: string;
  name: string;
  /** The XenDrive file used as the icon, if any. */
  icon: string | null;
  ownerId: string;
  members: CommunityMember[];
  /** Public info for the current members. */
  people: ChatPerson[];
  roles: CommunityRoleInfo[];
  /** What the person asking may do across the community (channels can change this for them). */
  permissions: CommunityPermission[];
  /** How many of its channels have something the person hasn't read (muted ones don't count). */
  unreadChannels: number;
  /** How many unread messages in it mention the person (or everyone). */
  unreadMentions: number;
  createdAt: string;
}

/** A text channel: a conversation that belongs to a community. Its messages are ordinary chat messages (`seq`, `ChatMessage`). */
export interface CommunityChannel {
  _id: string;
  communityId: string;
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
  /** Of those, how many mention the caller (or everyone). */
  mentions: number;
  muted: boolean;
  /** Who this channel is closed to, or open only to. Empty means it follows the community's roles. */
  overrides: ChannelOverride[];
  /** What the person asking may do in this channel: the community's permissions changed by the overrides. */
  permissions: CommunityPermission[];
  createdAt: string;
}

/** An invite waiting for you to answer (what you see in your own list). */
export interface MyCommunityInvite {
  communityId: string;
  communityName: string;
  communityIcon: string | null;
  memberCount: number;
  invitedBy: ChatPerson | null;
  createdAt: string;
}

/** An invite someone in the community sent and nobody has answered yet (what the community's managers see). */
export interface PendingCommunityInvite {
  person: ChatPerson;
  invitedBy: string;
  createdAt: string;
}
