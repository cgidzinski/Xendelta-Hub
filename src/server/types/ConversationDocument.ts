import { Message } from "./Message";

/**
 * Conversation document interface
 */
export interface ConversationDocument {
  _id: string;
  participants: string[];
  name?: string;
  createdBy?: string;
  updatedAt: Date;
  messages?: Message[];
}

