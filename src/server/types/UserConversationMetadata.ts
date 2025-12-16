/**
 * User conversation metadata stored in User document
 */
export interface UserConversationMetadata {
  conversationId: string;
  unread: boolean;
  lastReadTime?: Date;
}

