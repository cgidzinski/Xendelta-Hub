// Presence: whether a person is around, and what they chose to say about it. Shared by the server and the client.

/** What a person can choose. "invisible" shows them as offline to everyone else. */
export const PRESENCE_CHOICES = ["online", "idle", "dnd", "invisible"] as const;
export type PresenceChoice = (typeof PRESENCE_CHOICES)[number];

/** What others see. */
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

export const CUSTOM_STATUS_TEXT_MAX = 80;
export const CUSTOM_STATUS_EMOJI_MAX = 16;
/** How long after the last click or key press a tab counts as idle. */
export const IDLE_AFTER_MS = 5 * 60 * 1000;

export interface CustomStatus {
  text: string;
  emoji: string;
  /** ISO time the status clears itself, or null for never. */
  expiresAt: string | null;
}

export interface PresenceEntry {
  userId: string;
  status: PresenceStatus;
  customStatus: CustomStatus | null;
}

/** The person's own settings, which include "invisible" (shown to others as offline). */
export interface MyPresence {
  choice: PresenceChoice;
  customStatus: CustomStatus | null;
}

/** What the person's connections say: no tab open, a tab they are using, or only tabs they have left alone. */
export type SocketState = "offline" | "active" | "idle";

/** The status others see, from what the person chose and what their tabs say. Invisible and disconnected both read as offline. */
export function effectiveStatus(choice: PresenceChoice, sockets: SocketState): PresenceStatus {
  if (sockets === "offline" || choice === "invisible") return "offline";
  if (choice === "dnd") return "dnd";
  if (choice === "idle") return "idle";
  return sockets === "idle" ? "idle" : "online";
}

/** The custom status if it hasn't run out. */
export function activeCustomStatus(status: CustomStatus | null | undefined, now = Date.now()): CustomStatus | null {
  if (!status || (!status.text && !status.emoji)) return null;
  if (status.expiresAt && new Date(status.expiresAt).getTime() <= now) return null;
  return status;
}

export const PRESENCE_LABELS: Record<PresenceChoice, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  invisible: "Invisible",
};
