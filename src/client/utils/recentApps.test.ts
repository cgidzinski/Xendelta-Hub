import { describe, it, expect } from "vitest";
import { appKeyForPath, withRecentApp, MAX_RECENT_APPS } from "./recentApps";

describe("recent apps", () => {
  it("maps a path to its app, including pages inside it", () => {
    expect(appKeyForPath("/internal/xennote")).toBe("xennote");
    expect(appKeyForPath("/internal/xennote/abc123")).toBe("xennote");
    expect(appKeyForPath("/internal")).toBeNull();
    expect(appKeyForPath("/internal/messages")).toBeNull();
    // A different app whose path merely starts the same is not a match.
    expect(appKeyForPath("/internal/xennotes")).toBeNull();
  });

  it("moves the opened app to the front without duplicating it", () => {
    expect(withRecentApp(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(withRecentApp([], "a")).toEqual(["a"]);
  });

  it("keeps only the most recent few", () => {
    const many = Array.from({ length: MAX_RECENT_APPS }, (_, i) => `k${i}`);
    const next = withRecentApp(many, "new");
    expect(next).toHaveLength(MAX_RECENT_APPS);
    expect(next[0]).toBe("new");
  });
});
