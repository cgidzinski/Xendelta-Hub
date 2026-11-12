import { Link as RouterLink } from "react-router-dom";
import { Link } from "@mui/material";
import UserName from "./UserName";
import type { Cosmetics } from "@shared/cosmetics";

interface PersonLinkProps {
  /** A person, as a picker (`_id`) or a member list (`user_id`) carries them. */
  user: { _id?: string; user_id?: string; username?: string; cosmetics?: Cosmetics };
  fallback?: string;
}

/**
 * A person's name that opens their profile. Use it where a name is only displayed (a member list, an author line);
 * inside a clickable row or a chip keep plain `UserName`, so the row's own action still works.
 */
export default function PersonLink({ user, fallback }: PersonLinkProps) {
  const id = user._id ?? user.user_id;
  if (!id) return <UserName user={user} fallback={fallback} />;
  return (
    <Link component={RouterLink} to={`/internal/people/${id}`} color="inherit" underline="hover">
      <UserName user={user} fallback={fallback} />
    </Link>
  );
}
