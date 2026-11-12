import { describe, it, expect } from "vitest";
import {
  checklistToText,
  isSafeUrl,
  normalizeLabel,
  normalizeLabels,
  textToChecklist,
  MAX_LABELS,
  MAX_LABEL_LENGTH,
} from "./notes";

describe("labels", () => {
  it("trims, collapses spaces and cuts to the limit", () => {
    expect(normalizeLabel("  work   stuff ")).toBe("work stuff");
    expect(normalizeLabel("x".repeat(100))).toHaveLength(MAX_LABEL_LENGTH);
    expect(normalizeLabel("   ")).toBe("");
  });

  it("drops empties and repeats (ignoring case), keeps the first spelling, and caps the count", () => {
    expect(normalizeLabels(["Work", "work", " ", "Home", "WORK"])).toEqual(["Work", "Home"]);
    expect(normalizeLabels(Array.from({ length: 30 }, (_, i) => `l${i}`))).toHaveLength(MAX_LABELS);
  });
});

describe("isSafeUrl", () => {
  it("accepts only http and https addresses", () => {
    expect(isSafeUrl("https://example.com/a?b=1")).toBe(true);
    expect(isSafeUrl("http://localhost:3000")).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "ftp://x.y",
      "example.com",
      "",
      "//evil.com",
    ]) {
      expect(isSafeUrl(bad), bad).toBe(false);
    }
  });

  it("rejects an absurdly long address", () => {
    expect(isSafeUrl("https://example.com/" + "a".repeat(2100))).toBe(false);
  });
});

describe("text <-> checklist", () => {
  it("makes an item per non-empty line and strips bullets and brackets", () => {
    expect(textToChecklist("milk\n\n- eggs\n* bread\n[ ] tea\n[x] coffee\r\nsugar")).toEqual([
      { text: "milk", done: false },
      { text: "eggs", done: false },
      { text: "bread", done: false },
      { text: "tea", done: false },
      { text: "coffee", done: false },
      { text: "sugar", done: false },
    ]);
  });

  it("round-trips back to text, marking ticked items", () => {
    expect(
      checklistToText([
        { text: "a", done: false },
        { text: "b", done: true },
      ]),
    ).toBe("a\n[x] b");
    expect(textToChecklist("")).toEqual([]);
  });
});
