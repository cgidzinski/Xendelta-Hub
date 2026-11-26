import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import type { CallState, JoinedCall } from "@shared/calls";
import type { ChatPerson } from "@shared/chat";
import { api } from "../config/api";
import { useAuth } from "./AuthContext";
import { useRealtime } from "../hooks/useRealtime";
import { useSpeaking } from "../hooks/calls/useSpeaking";
import { callKeys } from "../hooks/calls/keys";
import { CallSession } from "../utils/callSession";
import {
  CALL_MIC_CONSTRAINTS,
  CALL_VIDEO_QUALITIES,
  callCameraConstraints,
  newTrackName,
  preferredVideoQuality,
  staleTracks,
  tracksToPull,
  type CallVideoQuality,
  type TrackKind,
} from "../utils/callMedia";
import { mediaErrorText, type MediaWanted } from "../utils/mediaErrors";

export interface RemoteStreams {
  audio?: MediaStream;
  video?: MediaStream;
  screen?: MediaStream;
}

export interface IncomingCall {
  conversationId: string;
  fromUserId: string;
  fromName: string;
  video: boolean;
}

interface CallContextType {
  /** Whether calls are set up on this server. */
  enabled: boolean;
  /** The call I am in (null when I'm not in one). */
  active: { conversationId: string; call: CallState | null; connecting: boolean; connection: "ok" | "lost" } | null;
  /** My own camera/microphone picture, and what I'm sharing. */
  local: { stream: MediaStream | null; screen: MediaStream | null };
  remote: Map<string, RemoteStreams>;
  muted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  speaking: ReadonlySet<string>;
  videoQuality: CallVideoQuality;
  setVideoQuality: (quality: CallVideoQuality) => Promise<void>;
  /** Someone is calling me. */
  incoming: IncomingCall | null;
  /** Whether the full-screen call view is showing (otherwise a small pill). */
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  join: (conversationId: string, video: boolean) => Promise<void>;
  leave: (quiet?: boolean) => Promise<void>;
  decline: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  /** Use another microphone or camera (by device id) for the rest of the call. */
  switchDevice: (kind: "audio" | "video", deviceId: string) => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

/** A failed microphone or camera says what to do about it (see utils/mediaErrors); anything else says what went wrong. */
const errorText = (e: any, fallback: string, wanted?: MediaWanted) =>
  (wanted && mediaErrorText(e, wanted)) || e?.response?.data?.message || e?.message || fallback;

/**
 * The call the person is in, kept at the root of the app so it survives moving around. It owns the connection
 * (utils/callSession), the microphone, camera and screen, pulls other people's tracks as they announce them, and shows
 * a call coming in. The screens in components/calls draw it.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user: authUser } = useAuth();
  // The provider sits above the sign-in gate, so there may be no user yet.
  const user = { id: authUser?.id ?? "" };
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: callKeys.status(),
    queryFn: async () => (await api.get<{ enabled: boolean }>("/api/calls/status")).enabled,
    enabled: isAuthenticated,
    staleTime: Infinity,
    retry: false,
  });

  const [active, setActive] = useState<CallContextType["active"]>(null);
  const [remote, setRemote] = useState<Map<string, RemoteStreams>>(new Map());
  const [local, setLocal] = useState<CallContextType["local"]>({ stream: null, screen: null });
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [videoQuality, setQuality] = useState(preferredVideoQuality);
  const quality = useRef(videoQuality);
  const speaking = useSpeaking([
    { id: user.id, stream: muted ? null : local.stream },
    ...[...remote].map(([id, streams]) => ({ id, stream: streams.audio })),
  ]);

  const activeRef = useRef(active);
  activeRef.current = active;
  const session = useRef<CallSession | null>(null);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const rejoin = useRef<(() => void) | null>(null);
  const attempt = useRef<symbol | null>(null);
  const joinRequest = useRef<Promise<JoinedCall> | null>(null);
  const leaving = useRef(false);
  const conversation = useRef<string | null>(null);
  const names = useRef<{ audio?: string; video?: string; screen?: string }>({});
  const pulled = useRef(new Set<string>());
  const mic = useRef<MediaStream | null>(null);
  const camera = useRef<MediaStream | null>(null);
  const screen = useRef<MediaStream | null>(null);
  const cameraDevice = useRef<string | undefined>(undefined);
  const cameraBusy = useRef<symbol | null>(null);
  const screenBusy = useRef<symbol | null>(null);

  const say = useCallback(
    (conversationId: string, change: Record<string, unknown>) =>
      api.put(`/api/calls/${conversationId}/state`, change).catch(() => undefined),
    [],
  );

  const clearConnection = useCallback(() => {
    if (lostTimer.current) clearTimeout(lostTimer.current);
    lostTimer.current = null;
    const previous = session.current;
    session.current = null;
    previous?.close();
    names.current = {};
    pulled.current = new Set();
    setRemote(new Map());
  }, []);

  /** Let go of everything: the connection, the devices, the streams. */
  const cleanup = useCallback(() => {
    clearConnection();
    attempt.current = null;
    retries.current = 0;
    for (const s of [mic, camera, screen]) {
      s.current?.getTracks().forEach((t) => t.stop());
      s.current = null;
    }
    conversation.current = null;
    cameraDevice.current = undefined;
    cameraBusy.current = null;
    screenBusy.current = null;
    setLocal({ stream: null, screen: null });
    setMuted(false);
    setCameraOn(false);
    setScreenOn(false);
    setActive(null);
  }, [clearConnection]);

  /** Pull what others announced and drop what they stopped. */
  const sync = useCallback(
    async (call: CallState | null) => {
      const current = session.current;
      if (!current || !call) return;
      const gone = staleTracks(call, user.id, pulled.current);
      if (gone.length > 0) {
        for (const key of gone) pulled.current.delete(key);
        setRemote((all) => {
          const next = new Map(all);
          for (const [userId, streams] of all) {
            const owner = call.participants.find((p) => p.userId === userId);
            if (!owner) next.delete(userId);
            else
              next.set(userId, {
                audio: owner.tracks.audio ? streams.audio : undefined,
                video: owner.tracks.video ? streams.video : undefined,
                screen: owner.tracks.screen ? streams.screen : undefined,
              });
          }
          return next;
        });
      }
      const wanted = tracksToPull(call, user.id, pulled.current);
      if (wanted.length === 0) return;
      wanted.forEach((t) => pulled.current.add(t.key));
      try {
        await current.pull(wanted);
      } catch {
        // Try again on the next change of the call.
        if (session.current === current) wanted.forEach((t) => pulled.current.delete(t.key));
      }
    },
    [user.id],
  );

  // The call changed (someone joined, left, muted, published): keep the chat's view and mine up to date.
  useRealtime("call:state", ({ conversationId, call }) => {
    const previous = queryClient.getQueryData<{ call: CallState | null; people: ChatPerson[] }>(
      callKeys.chat(conversationId),
    );
    queryClient.setQueryData(callKeys.chat(conversationId), { call, people: previous?.people ?? [] });
    // Someone new: fetch their name and picture.
    const known = new Set((previous?.people ?? []).map((p) => p._id));
    if (call?.participants.some((p) => !known.has(p.userId))) {
      void queryClient.invalidateQueries({ queryKey: callKeys.chat(conversationId) });
    }
    if (conversationId !== conversation.current) return;
    if (!call) {
      enqueueSnackbar("The call ended", { variant: "info" });
      cleanup();
      return;
    }
    // Say when someone leaves, and in a two-person call end it when the other person has gone.
    const before = activeRef.current?.call;
    if (before) {
      const nowIn = new Set(call.participants.map((p) => p.userId));
      const people = queryClient.getQueryData<{ people: ChatPerson[] }>(callKeys.chat(conversationId))?.people ?? [];
      for (const p of before.participants) {
        if (p.userId !== user.id && !nowIn.has(p.userId)) {
          const name = people.find((x) => x._id === p.userId)?.username ?? "Someone";
          enqueueSnackbar(`${name} left the call`, { variant: "info" });
        }
      }
      if (call.kind === "direct" && call.participants.length <= 1 && before.participants.length > 1) {
        enqueueSnackbar("The call ended", { variant: "info" });
        void leave(true);
        return;
      }
    }
    setActive((a) => (a ? { ...a, call } : a));
    void sync(call);
  });

  // Billing: a warning that the call will end for lack of gems, then the end of it.
  useRealtime("call:billing", ({ conversationId, message, ending }) => {
    if (conversationId !== conversation.current) return;
    enqueueSnackbar(message, { variant: ending ? "error" : "warning" });
    if (ending) void leave(true);
  });

  useRealtime("call:ring", (ring) => {
    if (!ring.ringing) {
      setIncoming((i) => (i?.conversationId === ring.conversationId ? null : i));
      return;
    }
    // Already in a call: let the person finish it. (A second ring shows once they have left.)
    if (conversation.current) return;
    setIncoming({
      conversationId: ring.conversationId,
      fromUserId: ring.fromUserId,
      fromName: ring.fromName,
      video: ring.video,
    });
  });

  const leave = useCallback(
    async (quiet = false) => {
      const id = conversation.current;
      if (!id) return;
      const pending = joinRequest.current;
      leaving.current = true;
      cleanup();
      if (!quiet) enqueueSnackbar("You left the call", { variant: "info" });
      try {
        await pending?.catch(() => undefined);
        await api.post(`/api/calls/${id}/leave`).catch(() => undefined);
      } finally {
        leaving.current = false;
      }
    },
    [cleanup, enqueueSnackbar],
  );

  const decline = useCallback(async () => {
    const id = incoming?.conversationId;
    setIncoming(null);
    if (id) await api.post(`/api/calls/${id}/decline`).catch(() => undefined);
  }, [incoming]);

  const connect = useCallback(
    async (id: string, video: boolean, ticket: symbol) => {
      const request = api.post<JoinedCall>(`/api/calls/${id}/join`, { video });
      joinRequest.current = request;
      const joined = await request.finally(() => {
        if (joinRequest.current === request) joinRequest.current = null;
      });
      if (attempt.current !== ticket) return;
      queryClient.setQueryData(callKeys.chat(id), { call: joined.call, people: joined.people });

      const s = new CallSession(id, joined.iceServers, {
        onRemoteTrack: (track, stream) => {
          if (session.current !== s) return;
          setRemote((all) => {
            const next = new Map(all);
            next.set(track.userId, { ...(next.get(track.userId) ?? {}), [track.kind]: stream });
            return next;
          });
        },
        onConnectionState: (state) => {
          if (session.current !== s) return;
          if (state === "connected") {
            if (lostTimer.current) clearTimeout(lostTimer.current);
            lostTimer.current = null;
            retries.current = 0;
            setActive((a) => (a ? { ...a, connection: "ok" } : a));
          } else if (state === "failed" || state === "disconnected") {
            setActive((a) => (a ? { ...a, connection: "lost" } : a));
            if (!lostTimer.current) {
              lostTimer.current = setTimeout(
                () => {
                  lostTimer.current = null;
                  rejoin.current?.();
                },
                state === "failed" ? 3000 : 8000,
              );
            }
          }
        },
      });
      session.current = s;

      const audio = mic.current!.getAudioTracks()[0];
      const cam = camera.current?.getVideoTracks()[0];
      const share = screen.current?.getVideoTracks()[0];
      names.current.audio = newTrackName("audio");
      await s.publish("audio", audio, names.current.audio);
      if (cam?.readyState === "live" && session.current === s) {
        names.current.video = newTrackName("video");
        await s.publish("video", cam, names.current.video, CALL_VIDEO_QUALITIES[quality.current].bitrate);
      }
      if (share?.readyState === "live" && session.current === s) {
        names.current.screen = newTrackName("screen");
        await s.publish("screen", share, names.current.screen);
      }
      if (session.current !== s) return;

      const camOn = cam?.readyState === "live";
      const sharing = share?.readyState === "live";
      if (!sharing && s.has("screen")) await s.replace("screen", null);
      if (session.current !== s) return;
      setCameraOn(camOn);
      setScreenOn(sharing);
      setLocal({
        stream: new MediaStream([audio, ...(cam && camOn ? [cam] : [])]),
        screen: sharing ? screen.current : null,
      });
      await say(id, { tracks: { ...names.current }, muted: !audio.enabled, cameraOn: camOn, screenOn: sharing });
      if (session.current !== s) return;
      setActive((a) => a && { ...a, call: a.call ?? joined.call, connecting: false });
      void sync(queryClient.getQueryData<{ call: CallState | null }>(callKeys.chat(id))?.call ?? joined.call);
    },
    [queryClient, say, sync],
  );

  const join = useCallback(
    async (id: string, video: boolean) => {
      if (conversation.current || leaving.current) {
        enqueueSnackbar("You're already in a call", { variant: "info" });
        return;
      }
      quality.current = preferredVideoQuality();
      setQuality(quality.current);
      const ticket = Symbol();
      attempt.current = ticket;
      conversation.current = id;
      setActive({ conversationId: id, call: null, connecting: true, connection: "ok" });
      setIncoming(null);
      setExpanded(true);
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: CALL_MIC_CONSTRAINTS });
        if (attempt.current !== ticket) {
          audio.getTracks().forEach((track) => track.stop());
          return;
        }
        mic.current = audio;
        if (video) {
          try {
            const picture = await navigator.mediaDevices.getUserMedia({
              video: callCameraConstraints(quality.current),
            });
            if (attempt.current !== ticket) {
              picture.getTracks().forEach((track) => track.stop());
              return;
            }
            camera.current = picture;
          } catch (e) {
            if (attempt.current !== ticket) return;
            const why = mediaErrorText(e, "camera");
            enqueueSnackbar(`${why ?? "Couldn't use the camera."} Joining with sound only.`, { variant: "warning" });
          }
        }
        await connect(id, video, ticket);
      } catch (e) {
        if (attempt.current !== ticket) return;
        enqueueSnackbar(errorText(e, "Couldn't join the call", "microphone"), { variant: "error" });
        await leave(true);
      }
    },
    [connect, enqueueSnackbar, leave],
  );

  // Let short drops recover naturally. A fresh session reuses the tracks and keeps the user's mute and device choices.
  rejoin.current = () => {
    const id = conversation.current;
    const ticket = attempt.current;
    if (!id || !ticket) return;
    if (retries.current >= 3) {
      enqueueSnackbar("Couldn't reconnect to the call", { variant: "error" });
      void leave(true);
      return;
    }
    retries.current += 1;
    clearConnection();
    setActive((a) => a && { ...a, connecting: true });
    void connect(id, !!camera.current, ticket).catch(() => {
      if (attempt.current !== ticket) return;
      clearConnection();
      lostTimer.current = setTimeout(() => rejoin.current?.(), 3000);
    });
  };

  const setVideoQuality = useCallback(
    async (next: CallVideoQuality) => {
      const s = session.current;
      if (!s || quality.current === next) return;
      const previous = quality.current;
      const track = camera.current?.getVideoTracks()[0];
      try {
        await s.setVideoBitrate(CALL_VIDEO_QUALITIES[next].bitrate);
        await track?.applyConstraints(callCameraConstraints(next));
        if (session.current !== s) return;
        quality.current = next;
        setQuality(next);
      } catch {
        if (session.current !== s) return;
        await s.setVideoBitrate(CALL_VIDEO_QUALITIES[previous].bitrate).catch(() => undefined);
        enqueueSnackbar("Couldn't change the camera quality.", { variant: "error" });
      }
    },
    [enqueueSnackbar],
  );

  const switchDevice = useCallback(
    async (kind: "audio" | "video", deviceId: string) => {
      const s = session.current;
      const source = kind === "audio" ? mic : camera;
      if (!s || !source.current) return;
      const device = { deviceId: { exact: deviceId } };
      let next: MediaStream | undefined;
      try {
        next = await navigator.mediaDevices.getUserMedia(
          kind === "audio"
            ? { audio: { ...CALL_MIC_CONSTRAINTS, ...device } }
            : { video: { ...callCameraConstraints(quality.current), ...device } },
        );
        if (session.current !== s || !source.current) return;
        const track = next.getTracks()[0];
        if (kind === "audio") track.enabled = source.current.getAudioTracks()[0].enabled;
        await s.replace(kind, track);
        if (session.current !== s || !source.current) return;
        if (kind === "audio") track.enabled = source.current.getAudioTracks()[0].enabled;
        source.current.getTracks().forEach((t) => t.stop());
        source.current = next;
        if (kind === "video") cameraDevice.current = deviceId;
        next = undefined;
        setLocal((l) => ({
          ...l,
          stream: new MediaStream([...(mic.current?.getTracks() ?? []), ...(camera.current?.getTracks() ?? [])]),
        }));
      } catch (e) {
        if (session.current === s)
          enqueueSnackbar(errorText(e, "Couldn't switch to that device", kind === "audio" ? "microphone" : "camera"), {
            variant: "error",
          });
      } finally {
        next?.getTracks().forEach((track) => track.stop());
      }
    },
    [enqueueSnackbar],
  );

  const toggleMute = useCallback(() => {
    const id = conversation.current;
    const track = mic.current?.getAudioTracks()[0];
    if (!id || !track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
    void say(id, { muted: !track.enabled });
  }, [say]);

  const toggleCamera = useCallback(async () => {
    const id = conversation.current;
    const s = session.current;
    if (!id || !s || cameraBusy.current) return;
    const ticket = Symbol();
    cameraBusy.current = ticket;
    let next: MediaStream | undefined;
    try {
      if (camera.current) {
        camera.current.getTracks().forEach((track) => track.stop());
        camera.current = null;
        setCameraOn(false);
        setLocal((l) => ({ ...l, stream: new MediaStream(mic.current?.getTracks() ?? []) }));
        await s.replace("video", null);
        if (session.current === s) await say(id, { cameraOn: false });
        return;
      }
      next = await navigator.mediaDevices.getUserMedia({
        video: { ...callCameraConstraints(quality.current), deviceId: cameraDevice.current },
      });
      if (session.current !== s) return;
      const track = next.getVideoTracks()[0];
      if (s.has("video")) await s.replace("video", track);
      else {
        const name = newTrackName("video");
        await s.publish("video", track, name, CALL_VIDEO_QUALITIES[quality.current].bitrate);
        if (session.current === s) names.current.video = name;
      }
      if (session.current !== s) return;
      camera.current = next;
      next = undefined;
      setCameraOn(true);
      setLocal((l) => ({ ...l, stream: new MediaStream([...(mic.current?.getTracks() ?? []), track]) }));
      await say(id, { tracks: { ...names.current }, cameraOn: true });
    } catch (e) {
      if (session.current === s)
        enqueueSnackbar(errorText(e, "Couldn't use the camera", "camera"), { variant: "error" });
    } finally {
      if (cameraBusy.current === ticket) cameraBusy.current = null;
      next?.getTracks().forEach((track) => track.stop());
    }
  }, [enqueueSnackbar, say]);

  const stopScreen = useCallback(
    async (source: MediaStream) => {
      if (screen.current !== source) return;
      source.getTracks().forEach((track) => track.stop());
      screen.current = null;
      setScreenOn(false);
      setLocal((l) => ({ ...l, screen: null }));
      const s = session.current;
      const id = conversation.current;
      if (!s || !id) return;
      await s.replace("screen", null).catch(() => undefined);
      if (session.current === s) await say(id, { screenOn: false });
    },
    [say],
  );

  const toggleScreen = useCallback(async () => {
    const id = conversation.current;
    const s = session.current;
    if (!id || !s || screenBusy.current) return;
    const ticket = Symbol();
    screenBusy.current = ticket;
    let next: MediaStream | undefined;
    try {
      if (screen.current) return await stopScreen(screen.current);
      next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (session.current !== s) return;
      const track = next.getVideoTracks()[0];
      if (s.has("screen")) await s.replace("screen", track);
      else {
        const name = newTrackName("screen");
        await s.publish("screen", track, name);
        if (session.current === s) names.current.screen = name;
      }
      if (session.current !== s || track.readyState === "ended") return;
      const source = next;
      screen.current = source;
      next = undefined;
      track.addEventListener("ended", () => void stopScreen(source), { once: true });
      setScreenOn(true);
      setLocal((l) => ({ ...l, screen: source }));
      await say(id, { tracks: { ...names.current }, screenOn: true });
    } catch (e: any) {
      // Backing out of the browser's share picker is an ordinary cancellation.
      if (session.current === s && e?.name !== "NotAllowedError")
        enqueueSnackbar(errorText(e, "Couldn't share your screen"), { variant: "error" });
    } finally {
      if (screenBusy.current === ticket) screenBusy.current = null;
      next?.getTracks().forEach((track) => track.stop());
    }
  }, [enqueueSnackbar, say, stopScreen]);

  // Signing out, or closing the tab, ends my part in the call (the server also drops me when my last tab closes).
  useEffect(() => {
    if (!isAuthenticated) cleanup();
  }, [isAuthenticated, cleanup]);
  useEffect(() => () => cleanup(), [cleanup]);

  const value = useMemo<CallContextType>(
    () => ({
      enabled: !!status.data,
      active,
      local,
      remote,
      muted,
      cameraOn,
      screenOn,
      speaking,
      videoQuality,
      setVideoQuality,
      incoming,
      expanded,
      setExpanded,
      join,
      leave,
      decline,
      toggleMute,
      toggleCamera,
      toggleScreen,
      switchDevice,
    }),
    [
      status.data,
      active,
      local,
      remote,
      muted,
      cameraOn,
      screenOn,
      speaking,
      videoQuality,
      setVideoQuality,
      incoming,
      expanded,
      join,
      leave,
      decline,
      toggleMute,
      toggleCamera,
      toggleScreen,
      switchDevice,
    ],
  );
  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export const useCall = (): CallContextType => {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used within a CallProvider");
  return context;
};

/** Re-exported so a screen can ask for the kinds of track by one name. */
export type { TrackKind };
