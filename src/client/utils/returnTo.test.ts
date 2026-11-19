import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearReturnTo, isSafeReturnTo, locationPath, peekReturnTo, rememberReturnTo } from "./returnTo";

describe("returnTo", () => {
  // The tests run in Node, which has no browser storage: a small stand-in.
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("keeps the query and hash of the page you were sent away from", () => {
    rememberReturnTo(locationPath({ pathname: "/internal/xennote", search: "?note=abc", hash: "#x" }));
    expect(peekReturnTo()).toBe("/internal/xennote?note=abc#x");
    expect(peekReturnTo()).toBe("/internal/xennote?note=abc#x");
    clearReturnTo();
    expect(peekReturnTo()).toBeNull();
  });

  it("only trusts addresses on this site and never loops back to sign-in", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "/login", "/signup?x=1", "", undefined]) {
      expect(isSafeReturnTo(bad)).toBe(false);
    }
    rememberReturnTo("//evil.example");
    expect(peekReturnTo()).toBeNull();
    expect(isSafeReturnTo("/n/abc")).toBe(true);
  });
});
