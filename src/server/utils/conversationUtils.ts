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
  participantInfo: Array<{ _id: string; username: string }>,
  currentUserId: string,
  systemBotId?: string
): string {
  // Include all participants except system bot
  const allParticipants = participantInfo.filter(
    (p) => p._id !== systemBotId
  );

  if (allParticipants.length === 0) {
    return participantInfo.some((p) => p._id === systemBotId) ? "System" : "Chat";
  }

  if (allParticipants.length === 1) {
    return allParticipants[0].username;
  }

  return allParticipants.map((p) => p.username).join(", ");
}

