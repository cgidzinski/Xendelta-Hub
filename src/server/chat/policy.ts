// The chat rules, in one place. Routes ask these questions and never decide for themselves.
//
//   Start a chat or add someone   any member, if `canMessage(actor, target)`
//   Rename                        any member
//   Remove someone else, hand the chat over   the owner
//   Leave                         anyone (the longest-standing member becomes owner if the owner goes)
//   Edit a message                its author
//   Delete a message              its author, or the owner
//
// Members use the standard shape of utils/membership.ts (`user_id`, `role`) with two roles, owner and member.
import type { ChatRole } from "@shared/chat";
import type { ChannelOverride, CommunityPermission } from "@shared/communities";
import { can } from "../social/policy";
import { hasPermission, type CommunityLike } from "../communities/policy";

export interface ChatMemberLike {
  user_id: string;
  role?: string | null;
  joinedAt?: Date | null;
}
export interface HasChatMembers {
  members: ChatMemberLike[];
}

export const roleInChat = (chat: HasChatMembers, userId: string): ChatRole | null => {
  const member = chat.members.find((m) => m.user_id === userId);
  return member ? (member.role === "owner" ? "owner" : "member") : null;
};
export const isChatMember = (chat: HasChatMembers, userId: string) => roleInChat(chat, userId) !== null;
export const isChatOwner = (chat: HasChatMembers, userId: string) => roleInChat(chat, userId) === "owner";

/** Whether `actor` may start a chat with, or add, `target`. The rule itself lives in social/policy.ts. */
export function canMessage(actor: string, target: string): boolean {
  return can(actor, target, "message");
}

export const canEditMessage = (message: { from?: string | null; deletedAt?: Date | null }, userId: string) =>
  message.from === userId && !message.deletedAt;

export const canDeleteMessage = (chat: HasChatMembers, message: { from?: string | null }, userId: string) =>
  message.from === userId || isChatOwner(chat, userId);

/** Who becomes owner when the owner leaves: the member who has been there longest. */
export function nextOwner(chat: HasChatMembers, leaving: string): string | null {
  const rest = chat.members.filter((m) => m.user_id !== leaving);
  rest.sort((a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0));
  return rest[0]?.user_id ?? null;
}

// A chat inside a community (a channel) is decided by the community's permissions instead of by who is in `members`. Pass the
// chat's community and its overrides for a channel, or leave `community` out for a DM or group chat, which behaves as before.
export interface ChatAccess {
  chat: HasChatMembers;
  community?: CommunityLike | null;
  overrides?: readonly ChannelOverride[];
}

function allowed(access: ChatAccess, userId: string, permission: CommunityPermission): boolean {
  if (access.community) return hasPermission(access.community, userId, permission, access.overrides);
  return isChatMember(access.chat, userId);
}

/** May see the chat and read its messages. */
export const canReadChat = (access: ChatAccess, userId: string) => allowed(access, userId, "readMessages");

/** May send messages, and react, in the chat. Needs read as well: you can't post where you can't see. */
export const canPostChat = (access: ChatAccess, userId: string) =>
  canReadChat(access, userId) && allowed(access, userId, "sendMessages");

/**
 * May do the managing `permission` stands for in the chat (delete others' messages, pin, mention everyone...). In a
 * DM or group chat that is the owner, as before.
 */
export function canManageChat(access: ChatAccess, userId: string, permission: CommunityPermission): boolean {
  if (access.community) return canReadChat(access, userId) && allowed(access, userId, permission);
  return isChatOwner(access.chat, userId);
}

/** Delete a message: your own, or anyone's if you manage messages (in a DM or group chat, if you own it). */
export const canDeleteChatMessage = (access: ChatAccess, message: { from?: string | null }, userId: string) =>
  message.from === userId || canManageChat(access, userId, "manageMessages");
