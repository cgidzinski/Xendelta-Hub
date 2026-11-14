import { describe, it, expect, beforeEach, vi } from "vitest";
import { forgetChatPlace, isChatPlace, lastChatPlace, rememberChatPlace } from "./chatLastPlace";

const id = (n: number) => String(n).repeat(24).slice(0, 24);

describe("chat last place", () => {
  // The tests run in Node, which has no browser storage: a small stand-in.
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("only a DM or a channel counts as a place", () => {
    expect(isChatPlace(`/internal/messages/${id(1)}`)).toBe(true);
    expect(isChatPlace(`/internal/communities/${id(1)}/${id(2)}`)).toBe(true);
    for (const no of [
      "/internal/messages",
      "/internal/communities",
      `/internal/communities/${id(1)}`,
      `/internal/communities/${id(1)}/settings`,
      `/internal/communities/${id(1)}/settings/roles`,
      `/internal/messages/${id(1)}?seq=3`,
      "/internal/home",
    ]) {
      expect(isChatPlace(no)).toBe(false);
    }
  });

  it("remembers the last place and gives it back", () => {
    expect(lastChatPlace()).toBeNull();
    rememberChatPlace(`/internal/messages/${id(1)}`);
    rememberChatPlace(`/internal/communities/${id(1)}/${id(2)}`);
    expect(lastChatPlace()).toBe(`/internal/communities/${id(1)}/${id(2)}`);
  });

  it("ignores paths that aren't places, and can forget", () => {
    rememberChatPlace(`/internal/messages/${id(1)}`);
    rememberChatPlace("/internal/communities");
    expect(lastChatPlace()).toBe(`/internal/messages/${id(1)}`);
    forgetChatPlace();
    expect(lastChatPlace()).toBeNull();
  });

  it("works without storage (a private window)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => rememberChatPlace(`/internal/messages/${id(1)}`)).not.toThrow();
    expect(lastChatPlace()).toBeNull();
    expect(() => forgetChatPlace()).not.toThrow();
  });

  it("doesn't trust what is in storage", () => {
    store.set("xenchat:lastPlace", "https://evil.example/");
    expect(lastChatPlace()).toBeNull();
  });
});
