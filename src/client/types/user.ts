// The user shapes the client works with. They are different views of one account, so each has a
// distinct name rather than another `User`:
//   AuthUser     the signed-in person (what AuthContext exposes)
//   PublicUser   anyone else, as shown in pickers, lists and messages: id, name, avatar
//   UserProfile  the signed-in person's full settings (hooks/user/useUserProfile)
//   AdminUser    the admin screen's view of an account (hooks/admin/useAdminUsers)

import type { Cosmetics } from "@shared/cosmetics";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  avatar: string;
}

export interface PublicUser {
  _id: string;
  username: string;
  cosmetics?: Cosmetics;
  avatar?: string | null;
}
