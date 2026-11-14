import { describe, it, expect } from "vitest";
import { highlightParts } from "./ChatSearchButton";

describe("highlightParts", () => {
  it("marks each search word, whatever its case, and keeps the rest as it was", () => {
    expect(highlightParts("Lake trip at the lake", "lake")).toEqual([
      { text: "Lake", hit: true },
      { text: " trip at the ", hit: false },
      { text: "lake", hit: true },
    ]);
  });
  it("marks several words", () => {
    expect(
      highlightParts("red car, blue car", "car blue")
        .filter((p) => p.hit)
        .map((p) => p.text),
    ).toEqual(["car", "blue", "car"]);
  });
  it("treats punctuation in the query as plain text", () => {
    expect(highlightParts("what (is) this?", "(is)")).toEqual([
      { text: "what ", hit: false },
      { text: "(is)", hit: true },
      { text: " this?", hit: false },
    ]);
  });
  it("returns the text whole when there is nothing to mark", () => {
    expect(highlightParts("hello", "")).toEqual([{ text: "hello", hit: false }]);
    expect(highlightParts("hello", "a")).toEqual([{ text: "hello", hit: false }]);
  });
});
