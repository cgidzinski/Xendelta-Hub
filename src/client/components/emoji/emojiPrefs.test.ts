import { describe, it, expect } from "vitest";
import { quickReactions } from "./emojiPrefs";

describe("quickReactions", () => {
  const defaults = ["👍", "❤️", "😂", "🎉", "😮", "🙏"];
  it("is the usual ones when nothing has been used", () => {
    expect(quickReactions([], defaults)).toEqual(defaults);
  });
  it("puts recent ones first and fills out with the usual ones, without repeats", () => {
    expect(quickReactions(["🔥", "👍"], defaults)).toEqual(["🔥", "👍", "❤️", "😂", "🎉", "😮"]);
  });
  it("is never longer than asked for", () => {
    expect(quickReactions(["a", "b", "c", "d", "e", "f", "g"], defaults, 4)).toEqual(["a", "b", "c", "d"]);
  });
});
