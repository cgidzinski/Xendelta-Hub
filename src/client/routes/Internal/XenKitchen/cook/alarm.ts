/** Unlock from a user gesture so a later alarm can play on mobile. */
export function prepareTimerAudio(context: AudioContext | null): AudioContext | null {
  try {
    const audio = context ?? new AudioContext();
    void audio.resume().catch(() => {});
    return audio;
  } catch {
    return null;
  }
}

export function playTimerAlarm(audio: AudioContext | null, kind: "halfway" | "done"): void {
  const finished = kind === "done";
  try {
    navigator.vibrate?.(finished ? [300, 150, 300] : 150);
  } catch {
    // Vibration is optional.
  }
  if (audio?.state !== "running") return;
  try {
    for (const offset of finished ? [0, 0.35, 0.7] : [0, 0.24]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const at = audio.currentTime + offset;
      oscillator.frequency.value = finished ? 880 : 620;
      gain.gain.setValueAtTime(0.18, at);
      gain.gain.exponentialRampToValueAtTime(0.01, at + 0.18);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.18);
    }
  } catch {
    // The visible alert is available even when audio playback fails.
  }
}
