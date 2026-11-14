import { describe, it, expect } from "vitest";
import type { CallState } from "@shared/calls";
import { callClock, canShareScreen, gridColumns, newTrackName, staleTracks, tracksToPull } from "./callMedia";

const call = (participants: Array<{ userId: string; sessionId: string; tracks?: any }>): CallState => ({
  conversationId: "c",
  startedAt: "2026-01-01T00:00:00Z",
  startedBy: "a",
  video: false,
  participants: participants.map((p) => ({
    userId: p.userId,
    sessionId: p.sessionId,
    tracks: p.tracks ?? {},
    muted: false,
    cameraOn: false,
    screenOn: false,
    joinedAt: "2026-01-01T00:00:00Z",
  })),
});

describe("tracksToPull", () => {
  const c = call([
    { userId: "me", sessionId: "s-me", tracks: { audio: "a-me" } },
    { userId: "b", sessionId: "s-b", tracks: { audio: "a-b", video: "v-b" } },
    { userId: "c", sessionId: "s-c", tracks: {} },
  ]);
  it("lists what others announced, never your own, and nothing for someone who published nothing", () => {
    expect(tracksToPull(c, "me", new Set()).map((t) => t.key)).toEqual(["s-b/a-b", "s-b/v-b"]);
  });
  it("skips what was already pulled", () => {
    expect(tracksToPull(c, "me", new Set(["s-b/a-b"])).map((t) => t.key)).toEqual(["s-b/v-b"]);
  });
  it("includes a shared screen", () => {
    const withScreen = call([{ userId: "b", sessionId: "s-b", tracks: { audio: "a", screen: "sc" } }]);
    expect(tracksToPull(withScreen, "me", new Set()).map((t) => t.kind)).toEqual(["audio", "screen"]);
  });
});

describe("staleTracks", () => {
  it("finds pulled tracks whose owner left or stopped publishing", () => {
    const c = call([{ userId: "b", sessionId: "s-b", tracks: { audio: "a-b" } }]);
    expect(staleTracks(c, "me", new Set(["s-b/a-b", "s-b/v-b", "s-gone/a"]))).toEqual(["s-b/v-b", "s-gone/a"]);
    expect(staleTracks(null, "me", new Set(["s-b/a-b"]))).toEqual(["s-b/a-b"]);
  });
});

describe("gridColumns", () => {
  it("grows with the number of people, and is narrower on a phone", () => {
    expect([1, 2, 4, 5, 9, 10].map((n) => gridColumns(n, false))).toEqual([1, 2, 2, 3, 3, 4]);
    expect([1, 2, 4, 5].map((n) => gridColumns(n, true))).toEqual([1, 2, 2, 3]);
  });
});

describe("callClock", () => {
  it("shows minutes and seconds, and hours when long", () => {
    expect([0, 59, 307, 3723].map(callClock)).toEqual(["0:00", "0:59", "5:07", "1:02:03"]);
  });
});

describe("track names and screen share", () => {
  it("names are different each time and safe for the server", () => {
    const a = newTrackName("audio");
    expect(a).toMatch(/^audio-[a-z0-9]{1,8}$/);
    expect(newTrackName("audio")).not.toBe(a);
  });
  it("screen share is a question for the browser", () => {
    expect(typeof canShareScreen()).toBe("boolean");
  });
});
