import { describe, it, expect } from "vitest";
import { emojiIdFromHref, isSpoilerHref, prepareMarkdown } from "./markdownPrep";

const ID = "64b64b64b64b64b64b64b64b";

describe("prepareMarkdown", () => {
  it("turns a custom emoji token into a link the renderer draws as a picture", () => {
    expect(prepareMarkdown(`hi <:party:${ID}>!`)).toBe(`hi [:party:](emoji:${ID})!`);
  });
  it("turns a spoiler into a link, escaping brackets in it", () => {
    expect(prepareMarkdown("it was ||the butler||")).toBe("it was [the butler](spoiler:)");
    expect(prepareMarkdown("||a [b] c||")).toBe("[a \\[b\\] c](spoiler:)");
  });
  it("leaves code exactly as written", () => {
    expect(prepareMarkdown("use `||x||` or <:a_b:" + ID + "> then\n```\n||y||\n<:c_d:" + ID + ">\n```")).toBe(
      "use `||x||` or [:a_b:](emoji:" + ID + ") then\n```\n||y||\n<:c_d:" + ID + ">\n```",
    );
  });
  it("keeps a line that starts with # from becoming a heading", () => {
    expect(prepareMarkdown("# not a heading")).toBe("\\# not a heading");
    expect(prepareMarkdown("ok\n## also not")).toBe("ok\n\\## also not");
    expect(prepareMarkdown("#hashtag")).toBe("#hashtag");
  });
  it("leaves ordinary text alone", () => {
    expect(prepareMarkdown("just **bold** words")).toBe("just **bold** words");
    expect(prepareMarkdown("")).toBe("");
  });
});

describe("reading the links back", () => {
  it("finds the emoji id and the spoiler", () => {
    expect(emojiIdFromHref(`emoji:${ID}`)).toBe(ID);
    expect(emojiIdFromHref("https://x")).toBeNull();
    expect(emojiIdFromHref(undefined)).toBeNull();
    expect(isSpoilerHref("spoiler:")).toBe(true);
    expect(isSpoilerHref("https://x")).toBe(false);
  });
});
