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
      (p) => p !== currentUserId && p !== "system"
    );
    if (otherParticipants.length === 0) {
      return conversation.participants.includes("system") ? "System" : "You";
    }
    if (otherParticipants.length === 1) {
      return `User ${otherParticipants[0].substring(0, 8)}`;
    }
    return `${otherParticipants.length} participants`;
  }

  const otherParticipants = conversation.participantInfo.filter(
    (p) => p._id !== currentUserId && p._id !== "system"
  );

  if (otherParticipants.length === 0) {
    return conversation.participants.includes("system") ? "System" : "You";
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
  if (participantId === "system") return "System";
  if (participantId === currentUserId) return "You";

  // Try to find in participantInfo
  const participant = participantInfo?.find((p) => p._id === participantId);
  if (participant) {
    return participant.username;
  }

  return `User ${participantId.substring(0, 8)}`;
}

/**
 * Get initials for a conversation avatar
 */
export function getParticipantInitials(
  conversation: Conversation,
  currentUserId?: string
): string {
  const otherParticipants = conversation.participants.filter(
    (p) => p !== currentUserId && p !== "system"
  );

  if (otherParticipants.length === 0) {
    return "S";
  }

  if (otherParticipants.length === 1) {
    return otherParticipants[0].substring(0, 1).toUpperCase();
  }

  return "G";
}

