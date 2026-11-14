// The small decisions a call makes, kept apart from the browser so they can be tested: which tracks to pull, how the tiles
// are laid out, and how long the call has gone on.
import type { CallState } from "@shared/calls";

export type TrackKind = "audio" | "video" | "screen";

export interface RemoteTrack {
  userId: string;
  sessionId: string;
  trackName: string;
  kind: TrackKind;
  /** `sessionId/trackName`: how a track is remembered once pulled. */
  key: string;
}

const KINDS: TrackKind[] = ["audio", "video", "screen"];

/** A name for a track we publish; the others ask Cloudflare for it by this name. */
export const newTrackName = (kind: TrackKind) => `${kind}-${Math.random().toString(36).slice(2, 10)}`;

/** The tracks other people announced that we haven't pulled yet. */
export function tracksToPull(call: CallState, meId: string, pulled: ReadonlySet<string>): RemoteTrack[] {
  const out: RemoteTrack[] = [];
  for (const p of call.participants) {
    if (p.userId === meId) continue;
    for (const kind of KINDS) {
      const trackName = p.tracks[kind];
      if (!trackName) continue;
      const key = `${p.sessionId}/${trackName}`;
      if (!pulled.has(key)) out.push({ userId: p.userId, sessionId: p.sessionId, trackName, kind, key });
    }
  }
  return out;
}

/** Pulled tracks whose owner has left the call or stopped publishing them (so their streams can be dropped). */
export function staleTracks(call: CallState | null, meId: string, pulled: ReadonlySet<string>): string[] {
  const live = new Set<string>();
  for (const p of call?.participants ?? []) {
    if (p.userId === meId) continue;
    for (const kind of KINDS) if (p.tracks[kind]) live.add(`${p.sessionId}/${p.tracks[kind]}`);
  }
  return [...pulled].filter((key) => !live.has(key));
}

/** How many columns of tiles for this many (a phone gets fewer). */
export function gridColumns(count: number, narrow: boolean): number {
  if (count <= 1) return 1;
  if (narrow) return count <= 4 ? 2 : 3;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

/** "5:07" or "1:02:03". */
export function callClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Whether this browser can share its screen (not iOS, and few phones). */
export const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
