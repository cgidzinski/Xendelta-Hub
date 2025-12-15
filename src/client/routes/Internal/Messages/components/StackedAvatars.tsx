import React from "react";
import { Box, Avatar } from "@mui/material";
import { Conversation } from "../../../../types";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";

interface StackedAvatarsProps {
  conversation: Conversation;
  currentUserId?: string;
  maxAvatars?: number;
  size?: number;
}

export default function StackedAvatars({
  conversation,
  currentUserId,
  maxAvatars = 10,
  size = 48,
}: StackedAvatarsProps) {
  const { profile } = useUserProfile();
  
  // Get all participants excluding system, but including current user
  let participants: Array<{ _id: string; username: string; avatar?: string }> = [];
  
  if (conversation.participantInfo) {
    participants = conversation.participantInfo.filter(
      (p) => p._id !== "system"
    );
  } else {
    // If no participantInfo, construct from participants array
    // Include current user if we have their info
    participants = conversation.participants
      .filter((p) => p !== "system")
      .map((p) => {
        if (p === currentUserId && profile) {
          return { _id: p, username: profile.username, avatar: profile.avatar };
        }
        return { _id: p, username: `User ${p.substring(0, 8)}` };
      });
  }

  // Limit to maxAvatars
  const displayParticipants = participants.slice(0, maxAvatars);
  const remainingCount = Math.max(0, participants.length - maxAvatars);

  if (displayParticipants.length === 0) {
    // Fallback: show system or single avatar
    const isSystem = conversation.participants.includes("system");
    return (
      <Avatar 
        src={isSystem ? undefined : participants.find(p => p._id === currentUserId)?.avatar}
        sx={{ width: size, height: size, borderRadius: 2 }}
      >
        {isSystem ? "S" : (currentUserId ? currentUserId.charAt(0).toUpperCase() : "?")}
      </Avatar>
    );
  }

  // Calculate container width to fit all overlapping avatars
  // First avatar at 0, each subsequent avatar overlaps by 50%
  const containerWidth = size + (displayParticipants.length - 1) * (size * 0.5) + (remainingCount > 0 ? size * 0.5 : 0);

  return (
    <Box sx={{ position: "relative", width: containerWidth, height: size, overflow: "visible", mr: 3 }}>
      {displayParticipants.map((participant, index) => {
        const avatarSrc = participant.avatar;
        const offset = index * (size * 0.5); // 50% overlap
        const zIndex = displayParticipants.length - index; // Later avatars on top

        return (
          <Avatar
            key={participant._id}
            src={avatarSrc}
            sx={{
              width: size,
              height: size,
              borderRadius: 2,
              position: "absolute",
              left: offset,
              zIndex: zIndex,
            }}
          >
            {participant.username?.charAt(0).toUpperCase() || "?"}
          </Avatar>
        );
      })}
      {remainingCount > 0 && (
        <Avatar
          sx={{
            width: size,
            height: size,
            borderRadius: 2,
            position: "absolute",
            left: displayParticipants.length * (size * 0.5),
            zIndex: 0,
            border: "2px solid",
            borderColor: "background.default",
            backgroundColor: "primary.main",
            fontSize: size * 0.4,
          }}
        >
          +{remainingCount}
        </Avatar>
      )}
    </Box>
  );
}
