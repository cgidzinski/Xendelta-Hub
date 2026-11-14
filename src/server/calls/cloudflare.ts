// A thin client for Cloudflare Realtime: the SFU (sessions and tracks) and TURN credentials. The secrets stay here: the
// browser only ever talks to our own /api/calls routes. Without the settings below, calls report themselves switched off.
import { AppError } from "../utils/http";
import type { CallTracksResult, IceServer, SessionDescription } from "@shared/calls";

const SFU = "https://rtc.live.cloudflare.com/v1/apps";
const TURN = "https://rtc.live.cloudflare.com/v1/turn/keys";
const TURN_TTL_SECONDS = 3600;

export interface CallsConfig {
  appId: string;
  appSecret: string;
  turnKeyId: string;
  turnToken: string;
}

/** The Cloudflare settings, or null when calls aren't set up (all four are needed). */
export function callsConfig(env: NodeJS.ProcessEnv = process.env): CallsConfig | null {
  const appId = env.CLOUDFLARE_REALTIME_APP_ID;
  const appSecret = env.CLOUDFLARE_REALTIME_APP_SECRET;
  const turnKeyId = env.CLOUDFLARE_TURN_KEY_ID;
  const turnToken = env.CLOUDFLARE_TURN_API_TOKEN;
  return appId && appSecret && turnKeyId && turnToken ? { appId, appSecret, turnKeyId, turnToken } : null;
}

export const callsEnabled = () => callsConfig() !== null;

function need(): CallsConfig {
  const config = callsConfig();
  if (!config) throw new AppError(503, "Calls aren't set up here");
  return config;
}

/** One request to Cloudflare. A failure is logged without the address or the secret and answered plainly. */
async function ask<T>(url: string, token: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("Cloudflare Realtime request failed:", e instanceof Error ? e.name : "error");
    throw new AppError(502, "The call service isn't reachable right now. Try again in a moment.");
  }
  if (!res.ok) {
    console.error("Cloudflare Realtime answered", res.status);
    throw new AppError(502, "The call service refused that. Try again in a moment.");
  }
  return (await res.json()) as T;
}

/** A new SFU session: one per person in a call. */
export async function createSession(): Promise<string> {
  const c = need();
  const { sessionId } = await ask<{ sessionId: string }>(`${SFU}/${c.appId}/sessions/new`, c.appSecret, "POST");
  return sessionId;
}

/** Publish or pull tracks in a session. `sessionDescription` is the browser's offer when it publishes. */
export async function sessionTracks(
  sessionId: string,
  body: { sessionDescription?: SessionDescription; tracks: unknown[] },
): Promise<CallTracksResult> {
  const c = need();
  return ask<CallTracksResult>(`${SFU}/${c.appId}/sessions/${sessionId}/tracks/new`, c.appSecret, "POST", body);
}

/** Send the browser's answer to an offer Cloudflare made (after pulling tracks). */
export async function renegotiate(sessionId: string, sessionDescription: SessionDescription): Promise<unknown> {
  const c = need();
  return ask(`${SFU}/${c.appId}/sessions/${sessionId}/renegotiate`, c.appSecret, "PUT", { sessionDescription });
}

/** Stop publishing tracks (by their `mid`). */
export async function closeTracks(
  sessionId: string,
  body: { tracks: Array<{ mid: string }>; force?: boolean; sessionDescription?: SessionDescription },
): Promise<CallTracksResult> {
  const c = need();
  return ask<CallTracksResult>(`${SFU}/${c.appId}/sessions/${sessionId}/tracks/close`, c.appSecret, "PUT", body);
}

let cached: { at: number; servers: IceServer[] } | null = null;

/** TURN/STUN servers for a connection. Credentials last an hour; one set is shared for most of that. */
export async function iceServers(): Promise<IceServer[]> {
  const c = need();
  if (cached && Date.now() - cached.at < (TURN_TTL_SECONDS * 1000) / 2) return cached.servers;
  const { iceServers: servers } = await ask<{ iceServers: IceServer[] | IceServer }>(
    `${TURN}/${c.turnKeyId}/credentials/generate-ice-servers`,
    c.turnToken,
    "POST",
    { ttl: TURN_TTL_SECONDS },
  );
  const list = Array.isArray(servers) ? servers : [servers];
  cached = { at: Date.now(), servers: list };
  return list;
}

/** For tests. */
export const clearIceCache = () => {
  cached = null;
};
