import { Message } from "./Message";
import { ParticipantInfo } from "./ParticipantInfo";

/**
 * Conversation interface
 */
export interface Conversation {
  _id: string;
  participants: string[];
  participantInfo?: ParticipantInfo[];
  name?: string;
  createdBy?: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  updatedAt: string;
  messageCount?: number;
  messages?: Message[];
}

