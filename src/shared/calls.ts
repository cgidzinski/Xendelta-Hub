// Voice and video calls, shared by the server and the client. Media goes through Cloudflare Realtime (an SFU: every
// person sends their tracks once and receives everyone else's), and our server only hands out sessions, relays the
// signalling to Cloudflare with its secret, and keeps track of who is in which call.

/** The most people in one call. */
export const CALL_MAX_PARTICIPANTS = 25;
/** How long a call rings, with nobody else joining, before it counts as missed. */
export const CALL_RING_SECONDS = 45;

/** The names a person gave the tracks they publish (the others ask Cloudflare for them by name). */
export interface CallTracks {
  audio?: string;
  video?: string;
  screen?: string;
}

export interface CallParticipant {
  userId: string;
  /** Their Cloudflare session: the others pull their tracks from it. */
  sessionId: string;
  tracks: CallTracks;
  muted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  joinedAt: string;
}

/** A call in progress in one chat (or voice channel). */
export interface CallState {
  conversationId: string;
  startedAt: string;
  startedBy: string;
  /** Started as a video call (the camera was asked for). */
  video: boolean;
  participants: CallParticipant[];
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** What the join route answers: your Cloudflare session, the ICE servers to use, and the call so far. */
export interface JoinedCall {
  sessionId: string;
  /** Names and pictures of the people in the call. */
  people: import("./chat").ChatPerson[];
  iceServers: IceServer[];
  call: CallState;
}

/** A track a client asks Cloudflare to publish (`local`) or to pull from another person (`remote`). */
export type CallTrackRequest =
  { location: "local"; mid: string; trackName: string } | { location: "remote"; sessionId: string; trackName: string };

export interface SessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

/** Cloudflare's answer to a publish or pull, passed on unchanged. */
export interface CallTracksResult {
  sessionDescription?: SessionDescription;
  requiresImmediateRenegotiation?: boolean;
  tracks?: Array<{ trackName?: string; mid?: string; errorCode?: string; errorDescription?: string }>;
}
