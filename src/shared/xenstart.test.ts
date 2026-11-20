import { describe, expect, it } from "vitest";
import { mergeRegionStyles, regionStyle, searchUrl } from "./xenstart";

describe("region layout preferences", () => {
  it("preserves the original layout and only applies fields changed by this draft", () => {
    expect(regionStyle("top")).toEqual({ height: 1, alignment: "start", paddingTop: 0 });
    expect(regionStyle("center").height).toBeNull();
    expect(regionStyle("bottom").alignment).toBe("end");
    expect(
      mergeRegionStyles(
        { top: { alignment: "center" } },
        { bottom: { paddingTop: 32 } },
        { top: { alignment: "center", height: 2 }, left: { paddingTop: 8 } },
      ),
    ).toEqual({ top: { height: 2 }, bottom: { paddingTop: 32 }, left: { paddingTop: 8 } });
  });
});

describe("XenStart search", () => {
  it.each([
    ["Google", "www.google.com", "/search"],
    ["DuckDuckGo", "duckduckgo.com", "/"],
    ["Bing", "www.bing.com", "/search"],
  ] as const)("opens %s with one encoded query", (engine, host, path) => {
    const url = new URL(searchUrl(engine, "  tea & coffee # café  ")!);
    expect(url.hostname).toBe(host);
    expect(url.pathname).toBe(path);
    expect([...url.searchParams]).toEqual([["q", "tea & coffee # café"]]);
    expect(url.hash).toBe("");
  });

  it("ignores blank queries", () => {
    expect(searchUrl("Google", "   ")).toBeNull();
  });
});
