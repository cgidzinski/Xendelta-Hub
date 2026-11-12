/**
 * Participant information
 */
import type { Cosmetics } from "@shared/cosmetics";

export interface ParticipantInfo {
  _id: string;
  username: string;
  cosmetics?: Cosmetics;
  email?: string;
  avatar?: string;
}
