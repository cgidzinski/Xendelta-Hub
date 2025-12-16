import { Conversation, ParticipantInfo } from "../types";

/**
 * Get display name for a conversation based on participants
 */
export function getParticipantDisplay(
  conversation: Conversation,
  currentUserId?: string
): string {
  if (!conversation.participantInfo) {
    // Fallback if participantInfo is not available
    const otherParticipants = conversation.participants.filter(
      (p) => p !== currentUserId
    );
    if (otherParticipants.length === 0) {
      return "You";
    }
    if (otherParticipants.length === 1) {
      return `User ${otherParticipants[0].substring(0, 8)}`;
    }
    return `${otherParticipants.length} participants`;
  }

  const otherParticipants = conversation.participantInfo.filter(
    (p) => p._id !== currentUserId
  );

  if (otherParticipants.length === 0) {
    return "You";
  }

  if (otherParticipants.length === 1) {
    return otherParticipants[0].username;
  }

  return `${otherParticipants.map((p) => p.username).join(", ")}`;
}

/**
 * Get display name for a single participant ID
 */
export function getParticipantDisplayById(
  participantId: string,
  currentUserId?: string,
  participantInfo?: ParticipantInfo[]
): string {
  if (participantId === currentUserId) return "You";

  // Try to find in participantInfo
  const participant = participantInfo?.find((p) => p._id === participantId);
  if (participant) {
    return participant.username;
  }

  return `User ${participantId.substring(0, 8)}`;
}