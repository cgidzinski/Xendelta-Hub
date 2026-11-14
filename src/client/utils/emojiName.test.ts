import { describe, it, expect } from "vitest";
import { suggestEmojiName } from "./emojiName";

describe("suggestEmojiName", () => {
  it("makes a typeable name from a file name", () => {
    expect(suggestEmojiName("Party Blob (2).png")).toBe("party_blob_2");
    expect(suggestEmojiName("thumbs-up.GIF")).toBe("thumbs_up");
    expect(suggestEmojiName("já_é.webp")).toBe("j");
  });
  it("is empty when nothing usable is left", () => {
    expect(suggestEmojiName("***.png")).toBe("");
    expect(suggestEmojiName("")).toBe("");
  });
  it("keeps it within the length limit without a trailing underscore", () => {
    const name = suggestEmojiName(`${"a".repeat(31)} bbbb.png`);
    expect(name.length).toBeLessThanOrEqual(32);
    expect(name.endsWith("_")).toBe(false);
  });
});
