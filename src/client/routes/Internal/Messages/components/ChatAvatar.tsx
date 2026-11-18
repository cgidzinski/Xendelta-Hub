import { Box } from "@mui/material";
import type { ChatConversation } from "@shared/chat";
import { PresenceBadge } from "../../../../components/presence/PresenceDot";
import UserAvatar from "../../../../components/user/UserAvatar";

interface ChatAvatarProps {
  conversation: Pick<ChatConversation, "people" | "name">;
  meId: string;
  size?: number;
}

/** A chat's picture: the other person for a two-person chat, two overlapping people for a group. */
export default function ChatAvatar({ conversation, meId, size = 44 }: ChatAvatarProps) {
  const others = conversation.people.filter((p) => p._id !== meId);
  const letter = (conversation.name || others[0]?.username || "?")[0]?.toUpperCase();

  if (others.length <= 1 && !conversation.name) {
    return (
      <PresenceBadge userId={others[0]?._id} size={Math.max(8, Math.round(size / 4))}>
        <UserAvatar user={others[0]} sx={{ width: size, height: size, flexShrink: 0 }}>
          {letter}
        </UserAvatar>
      </PresenceBadge>
    );
  }

  const small = Math.round(size * 0.68);
  const [first, second] = others.length > 0 ? others : conversation.people;
  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }} aria-hidden>
      <UserAvatar
        user={first}
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          width: small,
          height: small,
          border: 2,
          borderColor: "background.default",
        }}
      >
        {first?.username[0]?.toUpperCase()}
      </UserAvatar>
      <UserAvatar
        user={second}
        sx={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: small,
          height: small,
          border: 2,
          borderColor: "background.default",
        }}
      >
        {second?.username[0]?.toUpperCase() ?? "+"}
      </UserAvatar>
    </Box>
  );
}
