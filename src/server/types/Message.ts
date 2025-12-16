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

