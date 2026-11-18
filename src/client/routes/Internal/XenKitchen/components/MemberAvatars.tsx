import { AvatarGroup } from "@mui/material";
import UserAvatar from "../../../../components/user/UserAvatar";
import type { KitchenBook } from "../../../../hooks/xenkitchen/useKitchen";

/** The people a book is shared with, as a small stack of avatars. Nothing for a book only you are in. */
export default function MemberAvatars({ book, size = 22 }: { book: KitchenBook; size?: number }) {
  if (book.members.length < 2) return null;
  return (
    <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: size, height: size, fontSize: size * 0.5 } }}>
      {book.members.map((m) => (
        <UserAvatar key={m.user_id} user={m}>
          {m.username[0]?.toUpperCase()}
        </UserAvatar>
      ))}
    </AvatarGroup>
  );
}
