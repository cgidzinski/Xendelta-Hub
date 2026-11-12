/**
 * User information (generic type for author, owner, etc.)
 */
import type { Cosmetics } from "@shared/cosmetics";

export interface UserInfo {
  _id: string;
  username: string;
  cosmetics?: Cosmetics;
  avatar?: string;
}
