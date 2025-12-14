/**
 * Shared client-side type definitions
 */

/**
 * Message interface
 */
export interface Message {
  _id: string;
  from: string;
  message: string;
  time: string;
  unread?: boolean;
  parentMessageId?: string;
  senderUsername?: string;
  isSystemMessage?: boolean;
}

/**
 * Participant information
 */
export interface ParticipantInfo {
  _id: string;
  username: string;
  email?: string;
  avatar?: string;
}

/**
 * Conversation interface
 */
export interface Conversation {
  _id: string;
  participants: string[];
  participantInfo?: ParticipantInfo[];
  name?: string;
  canReply?: boolean;
  createdBy?: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  updatedAt: string;
  messageCount?: number;
  messages?: Message[];
}

/**
 * User profile interface
 */
export interface UserProfile {
  _id: string;
  username: string;
  email: string;
  avatar: string;
  roles?: string[];
  unread_messages: boolean;
  unread_notifications: boolean;
}

/**
 * Notification interface
 */
export interface Notification {
  _id: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  unread: boolean;
}

