// Voice messages: choosing what the browser can record, shaping the waveform, and showing times.
import { VOICE_WAVEFORM_BARS } from "@shared/chat";

/** What to record as: Opus in WebM where the browser can, AAC in MP4 on Safari, else whatever it offers. */
export function pickRecordingType(isSupported: (type: string) => boolean): { mime: string; extension: string } {
  for (const [mime, extension] of [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"],
    ["audio/mp4", "m4a"],
  ] as const) {
    if (isSupported(mime)) return { mime, extension };
  }
  return { mime: "", extension: "webm" };
}

/**
 * Boil the loudness readings taken while recording (0 to 1, any number of them) down to the fixed number of bars the
 * message carries (0 to 255), taking the loudest reading in each slice so a short word still shows. The loudest bar is
 * stretched to full height (unless it is near silence), so a quiet recording still shows its shape.
 */
export function toWaveform(samples: number[], bars = VOICE_WAVEFORM_BARS): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * samples.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / bars));
    let peak = 0;
    for (let j = from; j < to && j < samples.length; j++) peak = Math.max(peak, samples[j]);
    out.push(Math.round(Math.min(1, Math.max(0, peak)) * 255));
  }
  const loudest = Math.max(...out);
  return loudest >= 12 && loudest < 255 ? out.map((v) => Math.round((v / loudest) * 255)) : out;
}

/** 83 seconds as "1:23". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
export const nextSpeed = (current: number): number =>
  PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(current as 1) + 1) % PLAYBACK_SPEEDS.length] ?? 1;
