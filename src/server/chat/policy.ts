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
import { can } from "../social/policy";

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
