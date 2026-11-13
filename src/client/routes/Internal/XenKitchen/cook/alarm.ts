/** A short alert for a finished timer: vibrates where the device can, and plays three beeps. Best effort: never throws. */
export function alarm(): void {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* no vibration */
  }
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((at) => {
      const o = ctx.createOscillator();
      o.frequency.value = 880;
      o.connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.2);
    });
  } catch {
    /* no audio */
  }
}
