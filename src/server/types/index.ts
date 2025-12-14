/**
 * Shared server-side type definitions
 */

import { Request } from "express";

/**
 * Extended Request interface for authenticated routes
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    username: string;
    email: string;
    avatar: string;
  };
}

/**
 * User conversation metadata stored in User document
 */
export interface UserConversationMetadata {
  conversationId: string;
  unread: boolean;
  lastReadTime?: Date;
}

/**
 * Message interface
 */
export interface Message {
  _id: string;
  from: string;
  message: string;
  time: string;
  parentMessageId?: string;
  toObject?: () => Message;
}

/**
 * Conversation document interface
 */
export interface ConversationDocument {
  _id: string;
  participants: string[];
  name?: string;
  canReply?: boolean;
  createdBy?: string;
  updatedAt: Date;
  messages?: Message[];
}

