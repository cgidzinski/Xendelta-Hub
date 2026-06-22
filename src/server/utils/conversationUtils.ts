/**
 * Conversation Helper Functions
 * Utility functions for working with conversations
 */

import { ConversationDocument, Message } from "../types";

/**
 * Normalize a date value to an ISO string. Dates are stored as Date in the
 * schema, but legacy documents may still hold ISO strings, so handle both.
 */
function toISO(value: Date | string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Derive lastMessage and lastMessageTime from messages array
 */
export function getLastMessageInfo(
  conversation: ConversationDocument
): { lastMessage: string; lastMessageTime: string } {
  if (conversation.messages && conversation.messages.length > 0) {
    const lastMsg = conversation.messages[conversation.messages.length - 1];
    return {
      lastMessage: lastMsg.message || "",
      lastMessageTime: toISO(lastMsg.time) || toISO(conversation.updatedAt) || new Date().toISOString(),
    };
  }
  return {
    lastMessage: "",
    lastMessageTime: toISO(conversation.updatedAt) || new Date().toISOString(),
  };
}

/**
 * Generate default conversation name from participant usernames
 * Includes all participants including the current user
 */
export function generateDefaultConversationName(
  participantInfo: Array<{ _id: string; username: string }>
): string {
  if (participantInfo.length === 0) {
    return "Chat";
  }

  if (participantInfo.length === 1) {
    return participantInfo[0].username;
  }

  return participantInfo.map((p) => p.username).join(", ");
}

