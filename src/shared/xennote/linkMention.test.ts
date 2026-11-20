import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { checkPageDoc } from "./pageSchema";
import { findMention, linkFirstMention, mentionSnippet } from "./linkMention";

const target = { id: "665f0000000000000000abcd", title: "Risk register", aliases: ["risks", "Q4 risks"] };
const text = (t: string, ...marks: JSONContent["marks"][]): JSONContent => ({
  type: "text",
  text: t,
  ...(marks.length ? { marks: marks.flat() as never } : {}),
});
const para = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("findMention", () => {
  it("finds the title or an alias, whole words only, in any case", () => {
    expect(findMention("see the Risk register now", target)).toEqual({ index: 8, length: 13 });
    expect(findMention("see the risk REGISTER now", target)).toEqual({ index: 8, length: 13 });
    expect(findMention("the risks are high", target)).toEqual({ index: 4, length: 5 });
    expect(findMention("a risk registers list", target)).toBeNull();
    expect(findMention("asterisks", target)).toBeNull();
  });

  it("prefers the longest name at a place", () => {
    const t = { id: "x", title: "Q4 planning", aliases: ["Q4"] };
    expect(findMention("the Q4 planning day", t)).toEqual({ index: 4, length: 11 });
  });

  it("finds nothing for a page with no name", () => {
    expect(findMention("anything", { id: "x", title: "  ", aliases: [] })).toBeNull();
  });

  it("copes with characters that mean something in a pattern", () => {
    expect(findMention("see C++ (draft) here", { id: "x", title: "C++ (draft)", aliases: [] })).toEqual({
      index: 4,
      length: 11,
    });
  });
});

describe("linkFirstMention", () => {
  it("turns the first mention into a link and keeps the text around it", () => {
    const { doc: out, changed } = linkFirstMention(
      doc(para(text("Review the Risk register today, then Risk register again."))),
      target,
    );
    expect(changed).toBe(true);
    const [before, link, after] = out.content![0].content!;
    expect(before.text).toBe("Review the ");
    expect(link).toEqual({ type: "wikiLink", attrs: { page_id: target.id, title: "Risk register", label: "" } });
    expect(after.text).toBe(" today, then Risk register again.");
  });

  it("keeps what was typed as the label when it differs from the title", () => {
    const { doc: out } = linkFirstMention(doc(para(text("the risks are high"))), target);
    expect(out.content![0].content![1].attrs).toEqual({ page_id: target.id, title: "Risk register", label: "risks" });
  });

  it("keeps formatting on the text either side", () => {
    const bold = [{ type: "bold" }];
    const { doc: out } = linkFirstMention(doc(para(text("see Risk register here", bold))), target);
    const [before, link, after] = out.content![0].content!;
    expect(before.marks).toEqual(bold);
    expect(after.marks).toEqual(bold);
    expect(link.marks).toBeUndefined();
  });

  it("leaves code, links and code blocks alone, and finds the next plain mention", () => {
    const { doc: out, changed } = linkFirstMention(
      doc(
        { type: "codeBlock", content: [text("Risk register")] },
        para(
          text("Risk register", [{ type: "code" }]),
          text(" and "),
          text("Risk register", [{ type: "link", attrs: { href: "https://example.com" } }]),
        ),
        para(text("finally Risk register")),
      ),
      target,
    );
    expect(changed).toBe(true);
    expect(out.content![0].content![0].text).toBe("Risk register");
    expect(out.content![1].content!.map((n) => n.type)).toEqual(["text", "text", "text"]);
    expect(out.content![2].content!.map((n) => n.type)).toEqual(["text", "wikiLink"]);
  });

  it("changes nothing when there is no mention", () => {
    const original = doc(para(text("nothing relevant here")));
    const { doc: out, changed } = linkFirstMention(original, target);
    expect(changed).toBe(false);
    expect(out).toBe(original);
  });

  it("only changes the first mention", () => {
    const { doc: out } = linkFirstMention(doc(para(text("Risk register and Risk register"))), target);
    const kinds = out.content![0].content!.map((n) => n.type);
    expect(kinds.filter((k) => k === "wikiLink")).toHaveLength(1);
  });

  it("always gives back a body the page schema accepts", () => {
    const { doc: out } = linkFirstMention(
      doc(
        { type: "bulletList", content: [{ type: "listItem", content: [para(text("the Risk register"))] }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [para(text("x"))] }] },
      ),
      target,
    );
    expect(checkPageDoc(out).ok).toBe(true);
  });
});

describe("mentionSnippet", () => {
  it("shows the words around the mention", () => {
    const s = mentionSnippet("x".repeat(80) + " the Risk register is long " + "y".repeat(80), target);
    expect(s).toContain("Risk register");
    expect(s.startsWith("…")).toBe(true);
  });

  it("falls back to the start of the text", () => {
    expect(mentionSnippet("hello world", target)).toBe("hello world");
  });
});
