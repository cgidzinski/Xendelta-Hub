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

/** Record audio and measure its waveform while recording. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const requested = useRef<symbol | null>(null);
  const current = useRef<{ stop: () => void; discard: () => void; result: Promise<Recording | null> } | null>(null);

  const cancel = useCallback(() => {
    requested.current = null;
    const previous = current.current;
    current.current = null;
    previous?.discard();
  }, []);

  const start = useCallback(async () => {
    const ticket = Symbol();
    requested.current = ticket;
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    const release = () => media.getTracks().forEach((track) => track.stop());
    if (requested.current !== ticket) {
      release();
      return false;
    }

    let audio: AudioContext | undefined;
    let sampling: ReturnType<typeof setInterval> | undefined;
    let clock: ReturnType<typeof setInterval> | undefined;
    const cleanUp = () => {
      clearInterval(sampling);
      clearInterval(clock);
      release();
      void audio?.close().catch(() => undefined);
    };
    try {
      const { mime, extension } = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const samples: number[] = [];
      const Ctx =
        window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        try {
          audio = new Ctx();
          void audio.resume().catch(() => undefined);
          const analyser = audio.createAnalyser();
          analyser.fftSize = 512;
          audio.createMediaStreamSource(media).connect(analyser);
          const buffer = new Uint8Array(analyser.fftSize);
          sampling = setInterval(() => {
            analyser.getByteTimeDomainData(buffer);
            let peak = 0;
            for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128) / 128);
            samples.push(peak);
          }, 100);
        } catch {
          // A waveform is optional. The recording still works without Web Audio.
        }
      }

      const started = Date.now();
      const stop = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      const result = new Promise<Recording | null>((resolve) => {
        const complete = (recording: Recording | null) => {
          cleanUp();
          if (requested.current === ticket) setRecording(false);
          resolve(recording);
        };
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = () => complete(null);
        recorder.onstop = () => {
          if (requested.current !== ticket) return complete(null);
          const duration = Math.min(VOICE_MAX_SECONDS, (Date.now() - started) / 1000);
          const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
          complete(
            blob.size
              ? {
                  file: new File([blob], `voice-message.${extension}`, { type: blob.type }),
                  voice: { duration: Math.max(0.5, duration), waveform: toWaveform(samples.length ? samples : [0]) },
                }
              : null,
          );
        };
      });
      recorder.start();
      current.current = {
        result,
        stop,
        discard: () => {
          stop();
          cleanUp();
          setRecording(false);
        },
      };
      setSeconds(0);
      setRecording(true);
      clock = setInterval(() => {
        const elapsed = Math.min(VOICE_MAX_SECONDS, (Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= VOICE_MAX_SECONDS) stop();
      }, 250);
      return true;
    } catch (error) {
      cleanUp();
      throw error;
    }
  }, []);

  const finish = async () => {
    const held = current.current;
    if (!held) return null;
    current.current = null;
    held.stop();
    return held.result;
  };

  useEffect(() => cancel, [cancel]);

  return { recording, seconds, start, finish, cancel };
}
