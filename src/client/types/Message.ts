/**
 * Message interface
 */
import type { Cosmetics } from "@shared/cosmetics";

export interface Message {
  _id: string;
  from: string;
  message: string;
  time: string;
  parentMessageId?: string;
  senderUsername?: string;
  senderCosmetics?: Cosmetics;
  isSystemMessage?: boolean;
}
