// Who may reach a conversation, for a DM or group chat and for a channel of a space alike. It sits apart from
// chat/service.ts (which sends realtime events) so the socket layer can use it without a circular import.
import { Conversation, type ConversationDocument } from "../models/conversation";
import { Space, type SpaceDocument } from "../models/space";
import { channelOverrides } from "../spaces/channels";
import { canReadChat, isChatMember, type ChatAccess } from "./policy";

export interface ChatContext {
  chat: ConversationDocument;
  /** The space the chat is a channel of; null for a DM or group chat. */
  space: SpaceDocument | null;
  /** What `chat/policy.ts` asks: pass it to `canPostChat`, `canManageChat` and the like. */
  access: ChatAccess;
}

/**
 * The conversation and how to ask about it, if `userId` may see it: a member of a DM or group chat, or a member of the
 * space who can read the channel. Anyone else gets null (a 404 in the routes), so ids can't be probed.
 */
export async function resolveChatAccess(conversationId: string, userId: string): Promise<ChatContext | null> {
  const chat = await Conversation.findById(conversationId).exec();
  if (!chat) return null;
  if (!chat.spaceId) return isChatMember(chat, userId) ? { chat, space: null, access: { chat } } : null;

  const space = await Space.findOne({ _id: chat.spaceId, "members.user_id": userId }).exec();
  if (!space) return null;
  const access: ChatAccess = { chat, space, overrides: channelOverrides(chat) };
  return canReadChat(access, userId) ? { chat, space, access } : null;
}

/** Everyone who should hear about this conversation: its members, or the space members who can read the channel. */
export function audienceOf({ chat, space, access }: ChatContext): string[] {
  if (!space) return chat.members.map((m) => m.user_id);
  return space.members.map((m) => m.user_id).filter((id) => canReadChat(access, id));
}
