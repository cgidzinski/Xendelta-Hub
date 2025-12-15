/**
 * Message interface
 */
export interface Message {
  _id: string;
  from: string;
  message: string;
  time: string;
  parentMessageId?: string;
  senderUsername?: string;
  isSystemMessage?: boolean;
}

