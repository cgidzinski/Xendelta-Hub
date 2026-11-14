// One person's connection to a call. They hold a single RTCPeerConnection to Cloudflare's SFU: tracks they publish go out
// through it, and the tracks of everyone else are pulled in through it. The signalling goes via our own /api/calls
// routes (which hold the Cloudflare secret). Steps that change the connection are queued, because two renegotiations at
// once would break it.
import { api } from "../config/api";
import type { CallTrackRequest, CallTracksResult, IceServer } from "@shared/calls";
import type { RemoteTrack, TrackKind } from "./callMedia";

export interface CallSessionHandlers {
  /** A pulled track arrived. */
  onRemoteTrack: (track: RemoteTrack, stream: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
}

export class CallSession {
  private pc: RTCPeerConnection;
  private queue: Promise<unknown> = Promise.resolve();
  private senders = new Map<TrackKind, RTCRtpSender>();
  private byMid = new Map<string, RemoteTrack>();
  private closed = false;

  constructor(
    private conversationId: string,
    iceServers: IceServer[],
    handlers: CallSessionHandlers,
  ) {
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.pc.addEventListener("connectionstatechange", () => handlers.onConnectionState(this.pc.connectionState));
    this.pc.addEventListener("track", (event) => {
      const mid = event.transceiver.mid;
      const track = mid ? this.byMid.get(mid) : undefined;
      if (!track) return;
      handlers.onRemoteTrack(track, event.streams[0] ?? new MediaStream([event.track]));
    });
  }

  private base = () => `/api/calls/${this.conversationId}`;

  /** Run `step` after the ones before it. A failed step doesn't stop the ones after. */
  private enqueue<T>(step: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => (this.closed ? Promise.reject(new Error("closed")) : step()));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Start sending a track (a microphone, camera or screen). */
  publish(kind: TrackKind, track: MediaStreamTrack, trackName: string): Promise<void> {
    return this.enqueue(async () => {
      const transceiver = this.pc.addTransceiver(track, { direction: "sendonly", streams: [new MediaStream([track])] });
      this.senders.set(kind, transceiver.sender);
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const result = await api.post<CallTracksResult>(`${this.base()}/tracks`, {
        sessionDescription: { type: "offer", sdp: offer.sdp },
        tracks: [{ location: "local", mid: transceiver.mid ?? "", trackName } satisfies CallTrackRequest],
      });
      if (!result.sessionDescription) throw new Error("No answer from the call service");
      await this.pc.setRemoteDescription(result.sessionDescription);
    });
  }

  /** Swap the track being sent (or stop sending with null) without renegotiating. */
  async replace(kind: TrackKind, track: MediaStreamTrack | null): Promise<void> {
    await this.senders.get(kind)?.replaceTrack(track);
  }

  has(kind: TrackKind): boolean {
    return this.senders.has(kind);
  }

  /** Start receiving tracks other people publish. */
  pull(tracks: RemoteTrack[]): Promise<void> {
    if (tracks.length === 0) return Promise.resolve();
    return this.enqueue(async () => {
      const result = await api.post<CallTracksResult>(`${this.base()}/tracks`, {
        tracks: tracks.map(
          (t) => ({ location: "remote", sessionId: t.sessionId, trackName: t.trackName }) satisfies CallTrackRequest,
        ),
      });
      // Which mid carries which track, before the connection delivers them.
      for (const info of result.tracks ?? []) {
        const wanted = tracks.find((t) => t.trackName === info.trackName);
        if (wanted && info.mid) this.byMid.set(info.mid, wanted);
      }
      if (result.requiresImmediateRenegotiation && result.sessionDescription) {
        await this.pc.setRemoteDescription(result.sessionDescription);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await api.put(`${this.base()}/renegotiate`, { sessionDescription: { type: "answer", sdp: answer.sdp } });
      }
    });
  }

  close() {
    this.closed = true;
    this.pc.getSenders().forEach((s) => s.track?.stop());
    this.pc.close();
  }
}
