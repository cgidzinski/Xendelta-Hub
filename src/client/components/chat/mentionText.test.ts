import { describe, it, expect } from "vitest";
import type { ChatPerson } from "@shared/chat";
import { mentionBeforeCaret, mentionsToTokens, suggestMentions, tokensToMentions } from "./mentionText";

const person = (_id: string, username: string): ChatPerson => ({ _id, username, avatar: "" });
const A = "a".repeat(24);
const S = "b".repeat(24);
const SAM = "c".repeat(24);
const people = [person(A, "alex"), person(S, "sam"), person(SAM, "samantha")];

describe("mentionBeforeCaret", () => {
  it("finds the @partial before the cursor, even an empty one", () => {
    expect(mentionBeforeCaret("hi @sa", 6)).toEqual({ start: 3, query: "sa" });
    expect(mentionBeforeCaret("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionBeforeCaret("hey @", 5)).toEqual({ start: 4, query: "" });
  });
  it("needs the @ to start a word, and stops at a space", () => {
    expect(mentionBeforeCaret("mail me@example", 15)).toBeNull();
    expect(mentionBeforeCaret("hi @sam there", 13)).toBeNull();
    expect(mentionBeforeCaret("hi @sam there", 7)).toEqual({ start: 3, query: "sam" });
  });
});

describe("suggestMentions", () => {
  it("lists names that start with it first, then ones that contain it, never yourself", () => {
    expect(
      suggestMentions(people, A, "sam", false).map((c) => (c.kind === "person" ? c.person.username : c.kind)),
    ).toEqual(["sam", "samantha"]);
    expect(
      suggestMentions(people, S, "a", false).map((c) => (c.kind === "person" ? c.person.username : c.kind)),
    ).toEqual(["alex", "samantha"]);
  });
  it("offers @everyone and @here only to people who may use them", () => {
    expect(suggestMentions(people, A, "e", true).map((c) => c.kind)).toEqual(["everyone"]);
    expect(suggestMentions(people, A, "", true).map((c) => c.kind)).toEqual(["person", "person", "everyone", "here"]);
    expect(suggestMentions(people, A, "e", false).some((c) => c.kind === "everyone")).toBe(false);
  });
  it("limits the list", () => {
    expect(suggestMentions(people, "none", "", true, 2)).toHaveLength(2);
  });
});

describe("mentionsToTokens", () => {
  it("swaps a picked @name for its token", () => {
    expect(mentionsToTokens("hi @sam!", new Map([["sam", S]]))).toBe(`hi <@${S}>!`);
  });
  it("doesn't touch a longer name that starts the same, or an @name nobody picked", () => {
    const picked = new Map([["sam", S]]);
    expect(mentionsToTokens("hi @samantha", picked)).toBe("hi @samantha");
    expect(mentionsToTokens("hi @alex", picked)).toBe("hi @alex");
  });
  it("swaps the longer name first, so both can be in one message", () => {
    const picked = new Map([
      ["sam", S],
      ["samantha", SAM],
    ]);
    expect(mentionsToTokens("@sam and @samantha", picked)).toBe(`<@${S}> and <@${SAM}>`);
  });
  it("only swaps at the start of a word, and handles names with symbols", () => {
    expect(mentionsToTokens("mail x@sam", new Map([["sam", S]]))).toBe("mail x@sam");
    expect(mentionsToTokens("hi @a.b+c", new Map([["a.b+c", A]]))).toBe(`hi <@${A}>`);
  });
});

describe("tokensToMentions", () => {
  it("turns tokens back into @names and says who they were", () => {
    const names = new Map([[S, "sam"]]);
    const { text, picked } = tokensToMentions(`hi <@${S}> and <@${A}>`, (id) => names.get(id));
    expect(text).toBe(`hi @sam and <@${A}>`);
    expect([...picked]).toEqual([["sam", S]]);
  });
  it("round-trips", () => {
    const body = `hey <@${S}>, meet <@${SAM}>`;
    const names = new Map([
      [S, "sam"],
      [SAM, "samantha"],
    ]);
    const { text, picked } = tokensToMentions(body, (id) => names.get(id));
    expect(mentionsToTokens(text, picked)).toBe(body);
  });
});
