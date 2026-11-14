import { describe, it, expect } from "vitest";
import { formatDuration, nextSpeed, pickRecordingType, toWaveform } from "./voice";

describe("pickRecordingType", () => {
  it("prefers Opus in WebM, then MP4 for Safari", () => {
    expect(pickRecordingType(() => true)).toEqual({ mime: "audio/webm;codecs=opus", extension: "webm" });
    expect(pickRecordingType((t) => t === "audio/mp4")).toEqual({ mime: "audio/mp4", extension: "m4a" });
  });
  it("lets the browser choose when it supports none of them", () => {
    expect(pickRecordingType(() => false)).toEqual({ mime: "", extension: "webm" });
  });
});

describe("toWaveform", () => {
  it("always gives the fixed number of bars, from 0 to 255", () => {
    for (const n of [0, 1, 5, 48, 500]) {
      const bars = toWaveform(Array.from({ length: n }, (_, i) => (i % 10) / 10));
      expect(bars).toHaveLength(48);
      expect(bars.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
    }
  });
  it("keeps the loudest reading of each slice, so a short sound still shows", () => {
    const samples = Array(96).fill(0);
    samples[1] = 1;
    const bars = toWaveform(samples);
    expect(bars[0]).toBe(255);
    expect(bars.slice(1).every((b) => b === 0)).toBe(true);
  });
  it("stretches a quiet recording to full height, but leaves near silence alone", () => {
    expect(Math.max(...toWaveform(Array(96).fill(0.2)))).toBe(255);
    expect(Math.max(...toWaveform(Array(96).fill(0.01)))).toBe(3);
    expect(toWaveform(Array(96).fill(0))).toEqual(Array(48).fill(0));
  });
  it("clamps readings outside 0 to 1", () => {
    expect(toWaveform([2, -1], 2)).toEqual([255, 0]);
  });
});

describe("formatDuration", () => {
  it("shows minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7.4)).toBe("0:07");
    expect(formatDuration(83)).toBe("1:23");
    expect(formatDuration(300)).toBe("5:00");
  });
});

describe("nextSpeed", () => {
  it("cycles 1x, 1.5x, 2x and back", () => {
    expect([nextSpeed(1), nextSpeed(1.5), nextSpeed(2)]).toEqual([1.5, 2, 1]);
    expect(nextSpeed(9)).toBe(1);
  });
});
