// The calls going on right now. In memory, so a restart ends them (clients rejoin); the app runs as one process.
import {
  CALL_BITRATE_BPS,
  CALL_MAX_PARTICIPANTS,
  type CallParticipant,
  type CallState,
  type CallTracks,
} from "@shared/calls";

interface ActiveCall {
  conversationId: string;
  startedAt: Date;
  startedBy: string;
  video: boolean;
  kind: CallState["kind"];
  participants: Map<string, CallParticipant>;
  /** Everyone who has been in it, for the summary line. */
  everJoined: Set<string>;
  ringTimer?: ReturnType<typeof setTimeout>;
  /** The community that pays for a voice channel; absent in a DM or group chat (the people in it split the cost). */
  communityId?: string;
  /** When usage was last taken for billing (ms). */
  lastMeteredAt: number;
  /** Payers (a user id, or "community") warned that they can no longer pay; a second miss ends their call. */
  warned: Set<string>;
}

/** What one person publishes costs this much to deliver to each other person, in bits per second. */
const sendBps = (p: Pick<CallParticipant, "muted" | "cameraOn" | "screenOn">) =>
  (p.muted ? 0 : CALL_BITRATE_BPS.audio) +
  (p.cameraOn ? CALL_BITRATE_BPS.video : 0) +
  (p.screenOn ? CALL_BITRATE_BPS.screen : 0);

/** A stall (the process was busy) must not bill a long gap at once. */
const MAX_BILLED_GAP_SECONDS = 120;

const calls = new Map<string, ActiveCall>();

export const callRegistry = {
  get(conversationId: string): ActiveCall | undefined {
    return calls.get(conversationId);
  },

  /** Put a person in the call, starting it if there isn't one. Returns whether this started it. */
  join(
    conversationId: string,
    userId: string,
    sessionId: string,
    video: boolean,
    kind: CallState["kind"],
    communityId?: string,
  ) {
    let call = calls.get(conversationId);
    const started = !call;
    if (!call) {
      call = {
        conversationId,
        startedAt: new Date(),
        startedBy: userId,
        video,
        kind,
        participants: new Map(),
        everJoined: new Set(),
        communityId,
        lastMeteredAt: Date.now(),
        warned: new Set(),
      };
      calls.set(conversationId, call);
    }
    if (!call.participants.has(userId) && call.participants.size >= CALL_MAX_PARTICIPANTS)
      return { full: true as const };
    call.participants.set(userId, {
      userId,
      sessionId,
      tracks: {},
      muted: false,
      cameraOn: false,
      screenOn: false,
      joinedAt: new Date().toISOString(),
    });
    call.everJoined.add(userId);
    return { full: false as const, started, call };
  },

  /** Change what a person says about their own media. */
  update(
    conversationId: string,
    userId: string,
    change: Partial<Pick<CallParticipant, "muted" | "cameraOn" | "screenOn">> & { tracks?: CallTracks },
  ): CallParticipant | undefined {
    const me = calls.get(conversationId)?.participants.get(userId);
    if (!me) return undefined;
    if (change.tracks) me.tracks = { ...change.tracks };
    if (change.muted !== undefined) me.muted = change.muted;
    if (change.cameraOn !== undefined) me.cameraOn = change.cameraOn;
    if (change.screenOn !== undefined) me.screenOn = change.screenOn;
    return me;
  },

  /** Take a person out. When the last one goes the call ends and is returned (with how long it lasted). */
  leave(conversationId: string, userId: string): { ended: boolean; call?: ActiveCall; seconds?: number } {
    const call = calls.get(conversationId);
    if (!call || !call.participants.delete(userId)) return { ended: false };
    if (call.participants.size > 0) return { ended: false, call };
    clearTimeout(call.ringTimer);
    calls.delete(conversationId);
    return { ended: true, call, seconds: Math.round((Date.now() - call.startedAt.getTime()) / 1000) };
  },

  /** The calls a person is in (to take them out when their last tab closes). */
  callsOf(userId: string): string[] {
    return [...calls.values()].filter((c) => c.participants.has(userId)).map((c) => c.conversationId);
  },

  setRingTimer(conversationId: string, timer: ReturnType<typeof setTimeout> | undefined) {
    const call = calls.get(conversationId);
    if (!call) return;
    clearTimeout(call.ringTimer);
    call.ringTimer = timer;
  },

  state(conversationId: string): CallState | null {
    const call = calls.get(conversationId);
    if (!call) return null;
    return {
      conversationId,
      startedAt: call.startedAt.toISOString(),
      startedBy: call.startedBy,
      video: call.video,
      kind: call.kind,
      participants: [...call.participants.values()],
    };
  },

  /** Every call going on, for the meter. */
  ids(): string[] {
    return [...calls.keys()];
  },

  /**
   * What the call has cost to deliver since it was last taken: every other person in the call receives what each
   * participant sends (as capped, so this is an upper bound). A voice channel's whole cost is the community's; in a DM or
   * group chat it is split evenly between the people in the call.
   */
  takeUsage(
    conversationId: string,
    now: number = Date.now(),
  ): { bytes: number; payers: Array<{ type: "user"; id: string } | { type: "community"; id: string }> } | null {
    const call = calls.get(conversationId);
    if (!call) return null;
    const seconds = Math.min(MAX_BILLED_GAP_SECONDS, (now - call.lastMeteredAt) / 1000);
    call.lastMeteredAt = now;
    const people = [...call.participants.values()];
    if (seconds <= 0 || people.length < 2) return null;
    const bitsPerSecond = people.reduce((n, p) => n + sendBps(p) * (people.length - 1), 0);
    const bytes = (bitsPerSecond / 8) * seconds;
    if (bytes <= 0) return null;
    return {
      bytes,
      payers: call.communityId
        ? [{ type: "community", id: call.communityId }]
        : people.map((p) => ({ type: "user" as const, id: p.userId })),
    };
  },

  /** For tests. */
  reset() {
    for (const c of calls.values()) clearTimeout(c.ringTimer);
    calls.clear();
  },
};
