import { describe, expect, it } from "vitest";
import { searchUrl } from "./xenstart";

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
