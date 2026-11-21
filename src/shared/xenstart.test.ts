import { describe, expect, it } from "vitest";
import { mergeRegionStyles, moveQuickLink, quickLinkSlots, regionStyle, searchUrl } from "./xenstart";

describe("quick-link placement", () => {
  const first = { id: "first", label: "First", url: "https://example.com" };
  const second = { ...first, id: "second", label: "Second" };
  const third = { ...first, id: "third", label: "Third" };

  it("moves links into empty slots and keeps their previous slots empty", () => {
    const moved = moveQuickLink([first, second, third], first.id, 5, 6)!;
    expect(
      quickLinkSlots(moved)
        .slice(0, 6)
        .map((link) => link?.id),
    ).toEqual([undefined, second.id, third.id, undefined, undefined, first.id]);
    expect(moveQuickLink(moved, first.id, 0, 3)).toBeNull();
    expect(moveQuickLink(moved, second.id, 0, 3)).toEqual([
      { ...second, slot: 0 },
      { ...third, slot: 2 },
      { ...first, slot: 5 },
    ]);
  });

  it("preserves gaps and the order of hidden links when reordering occupied slots", () => {
    const links = [first, { ...second, slot: 3 }, { ...third, slot: 7 }];
    expect(moveQuickLink(links, first.id, 3, 6)).toEqual([
      { ...second, slot: 0 },
      { ...first, slot: 3 },
      { ...third, slot: 7 },
    ]);
  });
});

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
