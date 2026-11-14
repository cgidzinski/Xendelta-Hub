import type { Theme } from "@mui/material/styles";
import type { Community, CommunityPermission } from "@shared/communities";
import { roleColorOf } from "../../../utils/communityChat";

/** "Garden Club" → "GC". A single word gives its first two letters. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** The address of a community, or of one of its channels. */
export const communityPath = (communityId?: string, channelId?: string) =>
  ["/internal/communities", communityId, channelId].filter(Boolean).join("/");

/** The label and colour a name wears in a channel: the person's highest role (empty when they have none). */
export function senderMetaFor(
  community: Community,
  userId: string | null,
): { color: string; role: string } | undefined {
  if (!userId) return undefined;
  const member = community.members.find((m) => m.user_id === userId);
  if (!member) return undefined;
  if (member.role === "owner") return { color: roleColorOf(community, userId), role: "Owner" };
  const held = new Set(member.roleIds);
  const top = community.roles.filter((r) => held.has(r._id)).sort((a, b) => b.position - a.position)[0];
  return top ? { color: top.color, role: top.name } : undefined;
}

/** The members panel's sections: the owner, then each role that has people (highest first), then everyone else. */
export function memberGroups(
  community: Community,
): Array<{ key: string; label: string; color: string; ids: string[] }> {
  const people = new Map(community.people.map((p) => [p._id, p]));
  const byName = (a: string, b: string) => (people.get(a)?.username ?? "").localeCompare(people.get(b)?.username ?? "");
  const owner = community.members.filter((m) => m.role === "owner").map((m) => m.user_id);
  const placed = new Set(owner);
  const groups: Array<{ key: string; label: string; color: string; ids: string[] }> = [];
  if (owner.length) groups.push({ key: "owner", label: "Owner", color: "", ids: owner });

  for (const role of [...community.roles].filter((r) => !r.everyone).sort((a, b) => b.position - a.position)) {
    const ids = community.members
      .filter((m) => !placed.has(m.user_id) && m.roleIds.includes(role._id))
      .map((m) => m.user_id)
      .sort(byName);
    if (ids.length === 0) continue;
    ids.forEach((id) => placed.add(id));
    groups.push({ key: role._id, label: role.name, color: role.color, ids });
  }
  const rest = community.members
    .filter((m) => !placed.has(m.user_id))
    .map((m) => m.user_id)
    .sort(byName);
  if (rest.length) groups.push({ key: "members", label: "Members", color: "", ids: rest });
  return groups;
}

/**
 * A role's colour as text on the current theme. Roles are given a colour that reads on a light page, so on the dark
 * theme it is lightened to stay readable. Undefined when the role has no colour (the caller keeps the normal text).
 */
export const roleTextColor = (theme: Theme, color: string | undefined): string | undefined =>
  !color ? undefined : theme.palette.mode === "dark" ? `color-mix(in srgb, ${color}, white 45%)` : color;

/** What each permission is called and what it lets someone do, in the order the role editor lists them. */
export const PERMISSION_INFO: Array<{ key: CommunityPermission; label: string; description: string }> = [
  { key: "readMessages", label: "Read messages", description: "See channels and what is said in them" },
  { key: "sendMessages", label: "Send messages", description: "Post, reply and react" },
  { key: "manageMessages", label: "Delete others' messages", description: "Remove what anyone has posted" },
  { key: "pinMessages", label: "Pin messages", description: "Keep a message at the top" },
  { key: "mentionEveryone", label: "Mention everyone", description: "Notify the whole community" },
  { key: "invite", label: "Invite people", description: "Ask hub users to join" },
  { key: "kickMembers", label: "Remove people", description: "Take someone out of the community" },
  { key: "manageEmoji", label: "Manage emoji", description: "Add and remove custom emoji" },
  { key: "manageChannels", label: "Manage channels", description: "Add, rename, reorder and delete channels" },
  { key: "manageRoles", label: "Manage roles", description: "Make roles and give them to people" },
  { key: "manageCommunity", label: "Manage the community", description: "Rename it. The owner always can." },
];

/** The settings tabs the viewer may open, in order. */
export function settingsTabs(community: Pick<Community, "permissions">) {
  const has = (p: CommunityPermission) => community.permissions.includes(p);
  return [
    { key: "overview", label: "Overview" },
    ...(has("manageChannels") ? [{ key: "channels", label: "Channels" }] : []),
    ...(has("manageRoles") ? [{ key: "roles", label: "Roles" }] : []),
    ...(has("manageEmoji") ? [{ key: "emoji", label: "Emoji" }] : []),
    { key: "members", label: "Members" },
  ];
}

/** Whether the viewer has anything to do in the settings besides leaving. */
export const canOpenSettings = (community: Pick<Community, "permissions">) =>
  (
    [
      "manageCommunity",
      "manageChannels",
      "manageRoles",
      "manageEmoji",
      "kickMembers",
      "invite",
    ] as CommunityPermission[]
  ).some((p) => community.permissions.includes(p));
