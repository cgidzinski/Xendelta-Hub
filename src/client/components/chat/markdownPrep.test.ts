import { describe, it, expect } from "vitest";
import { emojiIdFromHref, isSpoilerHref, mentionFromHref, prepareMarkdown, type MentionContext } from "./markdownPrep";

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

describe("mentions", () => {
  const SAM = "b".repeat(24);
  const OUT = "c".repeat(24);
  const context = (over: Partial<MentionContext> = {}): MentionContext => ({
    nameOf: (id) => ({ [SAM]: "sam", [OUT]: "out[side]" })[id],
    ids: new Set([SAM]),
    everyone: false,
    here: false,
    ...over,
  });

  it("turns an accepted mention into a link drawn as a chip", () => {
    expect(prepareMarkdown(`hi <@${SAM}>!`, context())).toBe(`hi [@sam](mention:${SAM})!`);
    expect(mentionFromHref(`mention:${SAM}`)).toBe(SAM);
    expect(mentionFromHref("https://x")).toBeNull();
  });
  it("shows a mention the server didn't accept as plain words, with brackets made safe", () => {
    expect(prepareMarkdown(`hi <@${OUT}>`, context())).toBe("hi @out\\[side\\]");
    expect(prepareMarkdown(`hi <@${"d".repeat(24)}>`, context())).toBe("hi @someone");
  });
  it("makes @everyone and @here chips only when the message was allowed to use them", () => {
    expect(prepareMarkdown("hey @everyone and @here", context())).toBe("hey @everyone and @here");
    expect(prepareMarkdown("hey @everyone and @here", context({ everyone: true, here: true }))).toBe(
      "hey [@everyone](mention:everyone) and [@here](mention:here)",
    );
    expect(prepareMarkdown("mail me@everyone.com", context({ everyone: true }))).toBe("mail me@everyone.com");
  });
  it("leaves code alone", () => {
    expect(prepareMarkdown(`\`<@${SAM}> @everyone\``, context({ everyone: true }))).toBe(`\`<@${SAM}> @everyone\``);
  });
});
