import { describe, it, expect } from "vitest";
import type { ChangelogEntry } from "@shared/changelog";
import { entryKey, newKeys, unseenCount } from "./seen";

const e = (date: string, title: string): ChangelogEntry => ({ date, app: "hub", title });
const list = [e("2026-02-01", "C"), e("2026-01-15", "B"), e("2026-01-01", "A")];

describe("what's new, seen", () => {
  it("counts entries newer than the remembered one", () => {
    expect(unseenCount(list, entryKey(list[2]))).toBe(2);
    expect(unseenCount(list, entryKey(list[0]))).toBe(0);
  });
  it("shows the dot for someone who has never looked, and for a remembered entry that is gone", () => {
    expect(unseenCount(list, null)).toBe(3);
    expect(unseenCount(list, "2020-01-01|Gone")).toBe(3);
    expect(unseenCount([], null)).toBe(0);
  });
  it("marks entries New only when there is something to compare against", () => {
    expect([...newKeys(list, entryKey(list[2]))]).toEqual([entryKey(list[0]), entryKey(list[1])]);
    expect(newKeys(list, null).size).toBe(0);
    expect(newKeys(list, "2020-01-01|Gone").size).toBe(0);
  });
});
