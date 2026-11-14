import { describe, it, expect } from "vitest";
import { extractMentionIds, mentionToken, mentionsEveryone, mentionsHere } from "./mentions";

const A = "64b64b64b64b64b64b64b64b";
const B = "74b64b64b64b64b64b64b64b";

describe("mentions", () => {
  it("finds the people a body mentions, once each", () => {
    expect(extractMentionIds(`hi ${mentionToken(A)} and ${mentionToken(B)} and again ${mentionToken(A)}`)).toEqual([
      A,
      B,
    ]);
    expect(extractMentionIds("nobody here")).toEqual([]);
  });
  it("ignores a malformed token", () => {
    expect(extractMentionIds("<@123> <@not-an-id> <@>")).toEqual([]);
  });
  it("ignores anything inside code", () => {
    expect(extractMentionIds(`\`${mentionToken(A)}\` and \`\`\`\n${mentionToken(B)}\n\`\`\``)).toEqual([]);
    expect(mentionsEveryone("`@everyone`")).toBe(false);
  });
  it("finds @everyone and @here as whole words", () => {
    expect(mentionsEveryone("hello @everyone!")).toBe(true);
    expect(mentionsEveryone("@everyone")).toBe(true);
    expect(mentionsEveryone("mail me@everyone.com")).toBe(false);
    expect(mentionsEveryone("@everyoneelse")).toBe(false);
    expect(mentionsHere("is anyone @here?")).toBe(true);
    expect(mentionsHere("@herewego")).toBe(false);
  });
});
