import { useEffect, useRef, useState } from "react";

/** Who is talking right now: the ids whose audio is above a quiet threshold, held for a moment so a tile doesn't flicker. */
export function useSpeaking(sources: Array<{ id: string; stream?: MediaStream | null }>): Set<string> {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const latest = useRef(sources);
  latest.current = sources;
  // Re-run when the set of audio streams changes, not on every render.
  const signature = sources.map((s) => `${s.id}:${s.stream?.id ?? ""}`).join("|");

  useEffect(() => {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    const meters = latest.current
      .filter((s) => s.stream && s.stream.getAudioTracks().length > 0)
      .map((s) => {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(s.stream!).connect(analyser);
        return { id: s.id, analyser, buffer: new Uint8Array(analyser.fftSize), lastLoud: 0 };
      });
    const timer = setInterval(() => {
      const now = Date.now();
      const next = new Set<string>();
      for (const m of meters) {
        m.analyser.getByteTimeDomainData(m.buffer);
        let peak = 0;
        for (const v of m.buffer) peak = Math.max(peak, Math.abs(v - 128) / 128);
        if (peak > 0.06) m.lastLoud = now;
        if (now - m.lastLoud < 600) next.add(m.id);
      }
      setSpeaking((old) => (old.size === next.size && [...next].every((id) => old.has(id)) ? old : next));
    }, 150);
    return () => {
      clearInterval(timer);
      void ctx.close().catch(() => undefined);
    };
  }, [signature]);

  return speaking;
}
