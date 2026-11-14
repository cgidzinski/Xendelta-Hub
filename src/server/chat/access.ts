// Who may reach a conversation, for a DM or group chat and for a channel of a community alike. It sits apart from
// chat/service.ts (which sends realtime events) so the socket layer can use it without a circular import.
import { Conversation, type ConversationDocument } from "../models/conversation";
import { Community, type CommunityDocument } from "../models/community";
import { channelOverrides } from "../communities/channels";
import { canReadChat, isChatMember, type ChatAccess } from "./policy";

export interface ChatContext {
  chat: ConversationDocument;
  /** The community the chat is a channel of; null for a DM or group chat. */
  community: CommunityDocument | null;
  /** What `chat/policy.ts` asks: pass it to `canPostChat`, `canManageChat` and the like. */
  access: ChatAccess;
}

/**
 * The conversation and how to ask about it, if `userId` may see it: a member of a DM or group chat, or a member of the
 * community who can read the channel. Anyone else gets null (a 404 in the routes), so ids can't be probed.
 */
export async function resolveChatAccess(conversationId: string, userId: string): Promise<ChatContext | null> {
  const chat = await Conversation.findById(conversationId).exec();
  if (!chat) return null;
  if (!chat.communityId) return isChatMember(chat, userId) ? { chat, community: null, access: { chat } } : null;

  const community = await Community.findOne({ _id: chat.communityId, "members.user_id": userId }).exec();
  if (!community) return null;
  const access: ChatAccess = { chat, community, overrides: channelOverrides(chat) };
  return canReadChat(access, userId) ? { chat, community, access } : null;
}

/** Everyone who should hear about this conversation: its members, or the community members who can read the channel. */
export function audienceOf({ chat, community, access }: ChatContext): string[] {
  if (!community) return chat.members.map((m) => m.user_id);
  return community.members.map((m) => m.user_id).filter((id) => canReadChat(access, id));
}
