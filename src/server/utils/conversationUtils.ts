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

