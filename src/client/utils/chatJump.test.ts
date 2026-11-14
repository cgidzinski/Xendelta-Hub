import { describe, it, expect } from "vitest";
import { firstUnreadSeq, jumpTarget, messageLink, unreadDivider } from "./chatJump";

const seqs = (...n: number[]) => n.map((seq) => ({ seq }));

describe("jumpTarget", () => {
  it("reads a message number from the link", () => {
    expect(jumpTarget("?seq=12")).toBe(12);
    expect(jumpTarget("?x=1&seq=7")).toBe(7);
  });
  it("ignores anything that is not a plain positive number", () => {
    for (const bad of ["", "?seq=", "?seq=0", "?seq=-3", "?seq=1.5", "?seq=abc", "?seq=1e3", "?seq=99999999999"]) {
      expect(jumpTarget(bad)).toBeNull();
    }
  });
});

describe("messageLink", () => {
  it("points at the open chat and the message", () => {
    expect(messageLink("https://hub.example", "/internal/messages/abc", 9)).toBe(
      "https://hub.example/internal/messages/abc?seq=9",
    );
    expect(jumpTarget(new URL(messageLink("https://h", "/c/d", 41)).search)).toBe(41);
  });
});

describe("firstUnreadSeq", () => {
  it("is the message after the last one read, only when something is unread", () => {
    expect(firstUnreadSeq(10, 3)).toBe(11);
    expect(firstUnreadSeq(0, 5)).toBe(1);
    expect(firstUnreadSeq(10, 0)).toBeNull();
  });
});

describe("unreadDivider", () => {
  it("puts the divider before the first message from the unread point on", () => {
    expect(unreadDivider(seqs(8, 9, 10, 11, 12), 11, true)).toEqual({ state: "at", seq: 11 });
  });
  it("skips a gap (a deleted or missing number) to the next message", () => {
    expect(unreadDivider(seqs(8, 9, 12, 13), 10, true)).toEqual({ state: "at", seq: 12 });
  });
  it("is unknown when the history loaded doesn't reach back to the unread point", () => {
    expect(unreadDivider(seqs(50, 51, 52), 20, true)).toEqual({ state: "unloaded" });
  });
  it("starts at the first message when the whole history is loaded", () => {
    expect(unreadDivider(seqs(1, 2, 3), 1, false)).toEqual({ state: "at", seq: 1 });
    expect(unreadDivider(seqs(5, 6), 1, false)).toEqual({ state: "at", seq: 5 });
  });
  it("shows nothing when everything is read or nothing has come since", () => {
    expect(unreadDivider(seqs(1, 2, 3), null, false)).toEqual({ state: "none" });
    expect(unreadDivider(seqs(1, 2, 3), 9, false)).toEqual({ state: "none" });
    expect(unreadDivider([], 1, false)).toEqual({ state: "none" });
  });
});
