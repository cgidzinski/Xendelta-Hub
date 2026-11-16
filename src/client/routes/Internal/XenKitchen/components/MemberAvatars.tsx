import { Avatar, AvatarGroup } from "@mui/material";
import type { KitchenBook } from "../../../../hooks/xenkitchen/useKitchen";

/** The people a book is shared with, as a small stack of avatars. Nothing for a book only you are in. */
export default function MemberAvatars({ book, size = 22 }: { book: KitchenBook; size?: number }) {
  if (book.members.length < 2) return null;
  return (
    <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: size, height: size, fontSize: size * 0.5 } }}>
      {book.members.map((m) => (
        <Avatar key={m.user_id} src={m.avatar || undefined} alt={m.username}>
          {m.username[0]?.toUpperCase()}
        </Avatar>
      ))}
    </AvatarGroup>
  );
}
