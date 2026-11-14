import { describe, it, expect } from "vitest";
import type { EmojiEntry } from "./emojiData";
import { isEmojiOnly, shortcodeBeforeCaret, suggestShortcodes } from "./emojiText";

describe("shortcodeBeforeCaret", () => {
  it("finds the :partial before the cursor", () => {
    expect(shortcodeBeforeCaret("hi :smi", 7)).toEqual({ start: 3, query: "smi" });
    expect(shortcodeBeforeCaret(":joy", 4)).toEqual({ start: 0, query: "joy" });
  });
  it("needs two letters, and the colon to start a word", () => {
    expect(shortcodeBeforeCaret("hi :s", 5)).toBeNull();
    expect(shortcodeBeforeCaret("see https://x", 13)).toBeNull();
    expect(shortcodeBeforeCaret("a:smile", 7)).toBeNull();
  });
  it("only looks before the cursor", () => {
    expect(shortcodeBeforeCaret("hi :smile there", 9)).toEqual({ start: 3, query: "smile" });
    expect(shortcodeBeforeCaret("hi :smile there", 15)).toBeNull();
  });
  it("is gone once the code is closed or has a space in it", () => {
    expect(shortcodeBeforeCaret("hi :smile: ", 11)).toBeNull();
    expect(shortcodeBeforeCaret("hi :smile x", 11)).toBeNull();
  });
});

describe("suggestShortcodes", () => {
  const entry = (shortcode: string, order: number): EmojiEntry => ({
    emoji: shortcode,
    label: shortcode,
    tags: [],
    group: 0,
    order,
    skins: [],
    shortcode,
  });
  const list = [
    entry("smile", 1),
    entry("smiley", 2),
    entry("grinning_smile", 3),
    entry("joy", 4),
    { ...entry("none", 5), shortcode: undefined },
  ];
  it("puts names that start with it first, shortest first, then ones that contain it", () => {
    expect(suggestShortcodes(list, "smi").map((e) => e.shortcode)).toEqual(["smile", "smiley", "grinning_smile"]);
  });
  it("skips emoji with no shortcode, and limits the list", () => {
    expect(suggestShortcodes(list, "no")).toEqual([]);
    expect(suggestShortcodes(list, "s", 2)).toHaveLength(2);
  });
});

describe("isEmojiOnly", () => {
  it("is true for one to three emoji", () => {
    expect(isEmojiOnly("😀")).toBe(true);
    expect(isEmojiOnly("😀 🎉")).toBe(true);
    expect(isEmojiOnly("👋🏿")).toBe(true);
    expect(isEmojiOnly("👨‍👩‍👧")).toBe(true);
    expect(isEmojiOnly("🇨🇦🇨🇦🇨🇦")).toBe(true);
    expect(isEmojiOnly("🇨🇦🇨🇦🇨🇦🇨🇦")).toBe(false);
    expect(isEmojiOnly("🇨🇦")).toBe(true);
  });
  it("is false for text, more than three, or nothing", () => {
    expect(isEmojiOnly("hi 😀")).toBe(false);
    expect(isEmojiOnly("😀😀😀😀")).toBe(false);
    expect(isEmojiOnly("   ")).toBe(false);
    expect(isEmojiOnly("")).toBe(false);
    expect(isEmojiOnly("1")).toBe(false);
  });
});
