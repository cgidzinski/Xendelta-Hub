/**
 * Conversation Helper Functions
 * Utility functions for working with conversations
 */

import { ConversationDocument, Message } from "../types";

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
      lastMessageTime: lastMsg.time || conversation.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
  return {
    lastMessage: "",
    lastMessageTime: conversation.updatedAt?.toISOString() || new Date().toISOString(),
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

