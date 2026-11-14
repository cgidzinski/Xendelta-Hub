import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import type { CallState, JoinedCall } from "@shared/calls";
import type { ChatPerson } from "@shared/chat";
import { api } from "../config/api";
import { useAuth } from "./AuthContext";
import { useRealtime } from "../hooks/useRealtime";
import { callKeys } from "../hooks/calls/keys";
import { CallSession } from "../utils/callSession";
import { newTrackName, staleTracks, tracksToPull, type TrackKind } from "../utils/callMedia";

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
  /** Someone is calling me. */
  incoming: IncomingCall | null;
  /** Whether the full-screen call view is showing (otherwise a small pill). */
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  join: (conversationId: string, video: boolean) => Promise<void>;
  leave: () => Promise<void>;
  decline: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const errorText = (e: any, fallback: string) =>
  e?.name === "NotAllowedError"
    ? "Allow the microphone (and camera) in your browser to join the call."
    : e?.response?.data?.message || e?.message || fallback;

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

  const session = useRef<CallSession | null>(null);
  const conversation = useRef<string | null>(null);
  const names = useRef<{ audio?: string; video?: string; screen?: string }>({});
  const pulled = useRef(new Set<string>());
  const mic = useRef<MediaStream | null>(null);
  const camera = useRef<MediaStream | null>(null);
  const screen = useRef<MediaStream | null>(null);

  const say = useCallback(
    (conversationId: string, change: Record<string, unknown>) =>
      api.put(`/api/calls/${conversationId}/state`, change).catch(() => undefined),
    [],
  );

  /** Let go of everything: the connection, the devices, the streams. */
  const cleanup = useCallback(() => {
    session.current?.close();
    session.current = null;
    for (const s of [mic, camera, screen]) {
      s.current?.getTracks().forEach((t) => t.stop());
      s.current = null;
    }
    conversation.current = null;
    names.current = {};
    pulled.current = new Set();
    setRemote(new Map());
    setLocal({ stream: null, screen: null });
    setMuted(false);
    setCameraOn(false);
    setScreenOn(false);
    setActive(null);
  }, []);

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
        wanted.forEach((t) => pulled.current.delete(t.key));
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
    setActive((a) => (a ? { ...a, call } : a));
    void sync(call);
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

  const join = useCallback(
    async (conversationId: string, video: boolean) => {
      if (conversation.current) {
        enqueueSnackbar("You're already in a call", { variant: "info" });
        return;
      }
      conversation.current = conversationId;
      setActive({ conversationId, call: null, connecting: true, connection: "ok" });
      setIncoming(null);
      setExpanded(true);
      try {
        // The microphone first (and the camera for a video call): a refusal stops here, before anyone is told.
        mic.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (video) {
          try {
            camera.current = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            });
          } catch {
            enqueueSnackbar("Couldn't use the camera. Joining with sound only.", { variant: "warning" });
          }
        }
        const joined = await api.post<JoinedCall>(`/api/calls/${conversationId}/join`, { video });
        queryClient.setQueryData(callKeys.chat(conversationId), { call: joined.call, people: joined.people });
        const s = new CallSession(conversationId, joined.iceServers, {
          onRemoteTrack: (track, stream) =>
            setRemote((all) => {
              const next = new Map(all);
              next.set(track.userId, { ...(next.get(track.userId) ?? {}), [track.kind]: stream });
              return next;
            }),
          onConnectionState: (state) => {
            if (state === "failed" || state === "disconnected")
              setActive((a) => (a ? { ...a, connection: "lost" } : a));
            if (state === "connected") setActive((a) => (a ? { ...a, connection: "ok" } : a));
          },
        });
        session.current = s;

        names.current.audio = newTrackName("audio");
        await s.publish("audio", mic.current.getAudioTracks()[0], names.current.audio);
        const cam = camera.current?.getVideoTracks()[0];
        if (cam) {
          names.current.video = newTrackName("video");
          await s.publish("video", cam, names.current.video);
        }
        setLocal({
          stream: new MediaStream([...(mic.current?.getTracks() ?? []), ...(camera.current?.getTracks() ?? [])]),
          screen: null,
        });
        setCameraOn(!!cam);
        setActive({ conversationId, call: joined.call, connecting: false, connection: "ok" });
        // Announce what I publish: others pull it when they see this.
        await say(conversationId, { tracks: { ...names.current }, muted: false, cameraOn: !!cam });
        void sync(joined.call);
      } catch (e) {
        enqueueSnackbar(errorText(e, "Couldn't join the call"), { variant: "error" });
        // If the server already has me in it, take me out.
        void api.post(`/api/calls/${conversationId}/leave`).catch(() => undefined);
        cleanup();
      }
    },
    [cleanup, enqueueSnackbar, say, sync],
  );

  const leave = useCallback(async () => {
    const id = conversation.current;
    cleanup();
    if (id) await api.post(`/api/calls/${id}/leave`).catch(() => undefined);
  }, [cleanup]);

  const decline = useCallback(async () => {
    const id = incoming?.conversationId;
    setIncoming(null);
    if (id) await api.post(`/api/calls/${id}/decline`).catch(() => undefined);
  }, [incoming]);

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
    if (!id || !s) return;
    try {
      if (cameraOn) {
        // Turn it off: stop the camera (the light goes out) and send nothing.
        camera.current?.getTracks().forEach((t) => t.stop());
        camera.current = null;
        await s.replace("video", null);
        setCameraOn(false);
        setLocal((l) => ({ ...l, stream: new MediaStream(mic.current?.getTracks() ?? []) }));
        await say(id, { cameraOn: false });
        return;
      }
      camera.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const track = camera.current.getVideoTracks()[0];
      if (s.has("video")) await s.replace("video", track);
      else {
        names.current.video = newTrackName("video");
        await s.publish("video", track, names.current.video);
      }
      setCameraOn(true);
      setLocal((l) => ({ ...l, stream: new MediaStream([...(mic.current?.getTracks() ?? []), track]) }));
      await say(id, { tracks: { ...names.current }, cameraOn: true });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't use the camera"), { variant: "error" });
    }
  }, [cameraOn, enqueueSnackbar, say]);

  const toggleScreen = useCallback(async () => {
    const id = conversation.current;
    const s = session.current;
    if (!id || !s) return;
    const stop = async () => {
      screen.current?.getTracks().forEach((t) => t.stop());
      screen.current = null;
      await s.replace("screen", null);
      setScreenOn(false);
      setLocal((l) => ({ ...l, screen: null }));
      await say(id, { screenOn: false });
    };
    try {
      if (screenOn) return await stop();
      screen.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.current.getVideoTracks()[0];
      // The browser's own "Stop sharing" button ends the track.
      track.addEventListener("ended", () => void stop());
      if (s.has("screen")) await s.replace("screen", track);
      else {
        names.current.screen = newTrackName("screen");
        await s.publish("screen", track, names.current.screen);
      }
      setScreenOn(true);
      setLocal((l) => ({ ...l, screen: screen.current }));
      await say(id, { tracks: { ...names.current }, screenOn: true });
    } catch (e: any) {
      // Backing out of the picker isn't an error.
      if (e?.name !== "NotAllowedError")
        enqueueSnackbar(errorText(e, "Couldn't share your screen"), { variant: "error" });
    }
  }, [enqueueSnackbar, say, screenOn]);

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
      incoming,
      expanded,
      setExpanded,
      join,
      leave,
      decline,
      toggleMute,
      toggleCamera,
      toggleScreen,
    }),
    [
      status.data,
      active,
      local,
      remote,
      muted,
      cameraOn,
      screenOn,
      incoming,
      expanded,
      join,
      leave,
      decline,
      toggleMute,
      toggleCamera,
      toggleScreen,
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
