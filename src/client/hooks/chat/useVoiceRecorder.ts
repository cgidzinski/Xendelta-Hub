import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_SECONDS, type ChatVoice } from "@shared/chat";
import { pickRecordingType, toWaveform } from "../../utils/voice";

export interface Recording {
  file: File;
  voice: ChatVoice;
}

/** Whether this browser can record at all (it needs a secure page and MediaRecorder). */
export const canRecordVoice = () =>
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/**
 * Record from the microphone. `start()` asks for the microphone and begins; `finish()` stops and returns the file with its
 * length and waveform (measured while recording, so nothing has to be decoded afterwards, which Safari is fussy about);
 * `cancel()` throws it away. It stops by itself at the longest allowed length.
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const samples = useRef<number[]>([]);
  const started = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef<((r: Recording | null) => void) | null>(null);
  const extension = useRef("webm");

  const release = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close().catch(() => undefined);
    audio.current = null;
    recorder.current = null;
    setRecording(false);
  }, []);

  const finish = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        const r = recorder.current;
        if (!r || r.state === "inactive") return resolve(null);
        done.current = resolve;
        r.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    const r = recorder.current;
    done.current = () => undefined;
    chunks.current = [];
    if (r && r.state !== "inactive") r.stop();
    else release();
  }, [release]);

  const start = useCallback(async () => {
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.current = media;
    const { mime, extension: ext } = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    extension.current = ext;
    const r = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    recorder.current = r;
    chunks.current = [];
    samples.current = [];

    // Read the loudness ten times a second for the waveform.
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx: AudioContext = new Ctx();
      audio.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(media).connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      ticker.current = setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (const v of buffer) peak = Math.max(peak, Math.abs(v - 128) / 128);
        samples.current.push(peak);
      }, 100);
    }

    r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    r.onstop = () => {
      const duration = Math.min(VOICE_MAX_SECONDS, (Date.now() - started.current) / 1000);
      const type = r.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks.current, { type });
      const resolve = done.current;
      done.current = null;
      const waveformSource = samples.current.length > 0 ? samples.current : [0];
      release();
      resolve?.(
        blob.size > 0
          ? {
              file: new File([blob], `voice-message.${extension.current}`, { type: blob.type }),
              voice: { duration: Math.max(0.5, duration), waveform: toWaveform(waveformSource) },
            }
          : null,
      );
    };
    started.current = Date.now();
    setSeconds(0);
    r.start();
    setRecording(true);
    const clock = setInterval(() => {
      const elapsed = (Date.now() - started.current) / 1000;
      setSeconds(elapsed);
      if (elapsed >= VOICE_MAX_SECONDS && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
    // The clock stops with the recording.
    const stopClock = () => clearInterval(clock);
    r.addEventListener("stop", stopClock);
  }, [release]);

  // Leaving the screen while recording throws the recording away and lets go of the microphone.
  useEffect(
    () => () => {
      done.current = () => undefined;
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      else release();
    },
    [release],
  );

  return { recording, seconds, start, finish, cancel };
}
