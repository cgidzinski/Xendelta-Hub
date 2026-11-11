/**
 * Message interface
 */
export interface Message {
  _id?: unknown;
  from?: string | null;
  message?: string | null;
  time?: Date;
  parentMessageId?: string | null;
  toObject?: () => Message;
}
