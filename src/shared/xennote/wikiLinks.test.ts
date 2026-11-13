import { describe, it, expect } from "vitest";
import { completeWikiLink, linksTo, normalizeTitle, openWikiLink, wikiLinksIn } from "./wikiLinks";

describe("wikiLinksIn", () => {
  it("finds links, with their labels", () => {
    expect(wikiLinksIn("See [[Groceries]] and [[Trip plan|the plan]], then [[Groceries]] again.")).toEqual([
      { title: "Groceries", label: "Groceries" },
      { title: "Trip plan", label: "the plan" },
      { title: "Groceries", label: "Groceries" },
    ]);
  });

  it("ignores what isn't a link", () => {
    for (const text of [
      "[[]]",
      "[[   ]]",
      "[single]",
      "[[open",
      "close]]",
      "[[a\nb]]",
      "[[a[b]]",
      "[[a]b]]",
      "plain text",
      "",
    ]) {
      expect(wikiLinksIn(text), JSON.stringify(text)).toEqual([]);
    }
  });

  it("trims the title and keeps spaces inside it", () => {
    expect(wikiLinksIn("[[  Trip   plan  ]]")).toEqual([{ title: "Trip   plan", label: "Trip   plan" }]);
  });
});

describe("linksTo / normalizeTitle", () => {
  it("matches titles loosely", () => {
    expect(normalizeTitle("  Trip   PLAN ")).toBe("trip plan");
    expect(linksTo("do [[trip  plan]] soon", "Trip Plan")).toBe(true);
    expect(linksTo("do [[Trip plan|it]] soon", "trip plan")).toBe(true);
    expect(linksTo("do [[Trip plans]] soon", "Trip plan")).toBe(false);
    expect(linksTo("no links", "Trip plan")).toBe(false);
    expect(linksTo("[[x]]", "   ")).toBe(false);
  });
});

describe("openWikiLink", () => {
  it("sees an unfinished link at the caret", () => {
    expect(openWikiLink("see [[Gro", 9)).toEqual({ query: "Gro", start: 4 });
    expect(openWikiLink("see [[", 6)).toEqual({ query: "", start: 4 });
    expect(openWikiLink("[[a]] and [[b", 13)).toEqual({ query: "b", start: 10 });
  });
  it("is null when there is nothing to finish", () => {
    expect(openWikiLink("no brackets", 5)).toBeNull();
    expect(openWikiLink("[[done]] after", 14)).toBeNull();
    expect(openWikiLink("[[line one\ntwo", 14)).toBeNull();
    expect(openWikiLink("[[title|la", 10)).toBeNull();
    expect(openWikiLink("[[" + "x".repeat(201), 203)).toBeNull();
    expect(openWikiLink("see [[Gro", 3)).toBeNull(); // the caret is before it
  });
});

describe("completeWikiLink", () => {
  it("finishes the link and puts the caret after it", () => {
    expect(completeWikiLink("see [[Gro", 9, "Groceries")).toEqual({ text: "see [[Groceries]]", caret: 17 });
    expect(completeWikiLink("see [[Gro and more", 9, "Groceries")).toEqual({
      text: "see [[Groceries]] and more",
      caret: 17,
    });
  });
  it("doesn't double closing brackets that are already there", () => {
    expect(completeWikiLink("see [[Gro]] and", 9, "Groceries")).toEqual({ text: "see [[Groceries]] and", caret: 17 });
    expect(completeWikiLink("see [[Gro]]", 9, "Groceries")?.text).toBe("see [[Groceries]]");
  });
  it("cleans a title that has brackets or line breaks in it", () => {
    expect(completeWikiLink("[[x", 3, "A [odd] | title\nhere")?.text).toBe("[[A odd title here]]");
  });
  it("does nothing when no link is open", () => {
    expect(completeWikiLink("plain", 5, "Groceries")).toBeNull();
  });
});
