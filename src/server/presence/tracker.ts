// Who is around. A person is "online" while at least one of their tabs is connected and in use, "idle" when every
// tab has been left alone, and offline with no tab. What they chose (online, idle, do not disturb, invisible) and
// their status line are stored on the user; this file joins the two and tells the people who share a chat or a
// community with them when it changes.
import { Conversation } from "../models/conversation";
import { Community } from "../models/community";
import { User } from "../models/user";
import {
  activeCustomStatus,
  effectiveStatus,
  type CustomStatus,
  type PresenceChoice,
  type PresenceEntry,
  type SocketState,
} from "@shared/presence";

/** Passed in by the caller, so this file doesn't import the socket layer (which imports it). */
export type Send = (userIds: string[], event: "presence:update", payload: PresenceEntry) => void;

const sockets = new Map<string, Map<string, boolean>>(); // user -> socket -> idle?
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Presence changes bunch up (tabs opening, a flaky connection): one message goes out for the last state. */
export const PRESENCE_DEBOUNCE_MS = 1500;

export const presenceTracker = {
  connect(userId: string, socketId: string) {
    const mine = sockets.get(userId) ?? new Map<string, boolean>();
    mine.set(socketId, false);
    sockets.set(userId, mine);
  },
  setIdle(userId: string, socketId: string, idle: boolean) {
    const mine = sockets.get(userId);
    if (mine?.has(socketId)) mine.set(socketId, idle);
  },
  disconnect(userId: string, socketId: string) {
    const mine = sockets.get(userId);
    mine?.delete(socketId);
    if (mine && mine.size === 0) sockets.delete(userId);
  },
  state(userId: string): SocketState {
    const mine = sockets.get(userId);
    if (!mine || mine.size === 0) return "offline";
    return [...mine.values()].every(Boolean) ? "idle" : "active";
  },
  /** For tests. */
  reset() {
    sockets.clear();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  },
};

/** Everyone who shares a DM, group chat or community with this person (not the person themself). */
export async function peopleSharingWith(userId: string): Promise<string[]> {
  const [chats, communities] = await Promise.all([
    Conversation.find({ "members.user_id": userId }, "members.user_id").lean().exec(),
    Community.find({ "members.user_id": userId }, "members.user_id").lean().exec(),
  ]);
  const ids = new Set<string>();
  for (const group of [...chats, ...communities]) for (const m of group.members ?? []) ids.add(m.user_id);
  ids.delete(userId);
  return [...ids];
}

const customOf = (user: {
  presence?: { customStatus?: { text?: string | null; emoji?: string | null; expiresAt?: Date | null } | null } | null;
}): CustomStatus | null => {
  const c = user.presence?.customStatus;
  if (!c) return null;
  return activeCustomStatus({
    text: c.text ?? "",
    emoji: c.emoji ?? "",
    expiresAt: c.expiresAt?.toISOString() ?? null,
  });
};

/** What others see of these people. Someone who is invisible or has no tab open is offline, with no status line. */
export async function presenceOf(userIds: string[]): Promise<PresenceEntry[]> {
  const users = await User.find({ _id: { $in: userIds } }, "presence")
    .lean()
    .exec();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return userIds.map((userId) => {
    const user = byId.get(userId);
    const status = effectiveStatus(
      (user?.presence?.choice ?? "online") as PresenceChoice,
      presenceTracker.state(userId),
    );
    return { userId, status, customStatus: status === "offline" || !user ? null : customOf(user) };
  });
}

/** Tell the people who share a chat or community with `userId` (and their own other tabs) how they look now. */
export async function announcePresence(userId: string, send: Send): Promise<void> {
  const [entry] = await presenceOf([userId]);
  const audience = await peopleSharingWith(userId);
  send([...audience, userId], "presence:update", entry);
}

/** Like announcePresence, once things have settled. */
export function scheduleAnnounce(userId: string, send: Send): void {
  clearTimeout(timers.get(userId));
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      void announcePresence(userId, send).catch(() => undefined);
    }, PRESENCE_DEBOUNCE_MS),
  );
}
