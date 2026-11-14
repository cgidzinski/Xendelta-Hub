import { describe, it, expect } from "vitest";
import { customIdOfReaction, customReactionKey, emojiToken, plainEmojiText } from "./emoji";

const ID = "64b64b64b64b64b64b64b64b";

describe("custom emoji text", () => {
  it("writes and reads a reaction key", () => {
    expect(customReactionKey(ID)).toBe(`c:${ID}`);
    expect(customIdOfReaction(`c:${ID}`)).toBe(ID);
  });
  it("only reads a well-formed key", () => {
    expect(customIdOfReaction("👍")).toBeNull();
    expect(customIdOfReaction("c:short")).toBeNull();
    expect(customIdOfReaction(`x:${ID}`)).toBeNull();
    expect(customIdOfReaction(`c:${ID}0`)).toBeNull();
  });
  it("makes the token a message holds", () => {
    expect(emojiToken({ name: "party", _id: ID })).toBe(`<:party:${ID}>`);
  });
  it("turns tokens into :name: for previews, and leaves everything else alone", () => {
    expect(plainEmojiText(`hi <:party:${ID}> and <:a_b:${ID}>!`)).toBe("hi :party: and :a_b:!");
    expect(plainEmojiText("no tokens <:bad:123> here")).toBe("no tokens <:bad:123> here");
    expect(plainEmojiText("")).toBe("");
  });
});
