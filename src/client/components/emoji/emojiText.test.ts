import { describe, it, expect } from "vitest";
import type { EmojiEntry } from "./emojiData";
import type { CustomEmoji } from "@shared/emoji";
import { isEmojiOnly, shortcodeBeforeCaret, splitEmojiText, suggestCustom, suggestShortcodes } from "./emojiText";

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

const ID = "64b64b64b64b64b64b64b64b";
describe("custom emoji in text", () => {
  it("counts a custom emoji as one emoji for the large display", () => {
    expect(isEmojiOnly(`<:party:${ID}>`)).toBe(true);
    expect(isEmojiOnly(`<:party:${ID}> 🎉`)).toBe(true);
    expect(isEmojiOnly(`<:a_b:${ID}><:a_b:${ID}><:a_b:${ID}><:a_b:${ID}>`)).toBe(false);
    expect(isEmojiOnly(`hi <:party:${ID}>`)).toBe(false);
  });

  it("splits a body into text and emoji, in order", () => {
    expect(splitEmojiText(`hi <:party:${ID}> there <:cat_2:${ID}>`)).toEqual([
      { type: "text", text: "hi " },
      { type: "emoji", name: "party", id: ID },
      { type: "text", text: " there " },
      { type: "emoji", name: "cat_2", id: ID },
    ]);
    expect(splitEmojiText("plain")).toEqual([{ type: "text", text: "plain" }]);
    expect(splitEmojiText("")).toEqual([]);
    expect(splitEmojiText(`<:x:123> is not a token`)).toEqual([{ type: "text", text: "<:x:123> is not a token" }]);
  });

  it("suggests custom emoji by name", () => {
    const e = (name: string): CustomEmoji => ({
      _id: name,
      name,
      url: "u",
      animated: false,
      scope: { type: "chat", id: "c" },
      createdBy: "a",
    });
    const list = [e("party_blob"), e("blob"), e("cat")];
    expect(suggestCustom(list, "blo").map((x) => x.name)).toEqual(["blob", "party_blob"]);
    expect(suggestCustom(list, "zz")).toEqual([]);
    expect(suggestCustom(list, "a", 1)).toHaveLength(1);
  });
});
