import { describe, it, expect, vi } from "vitest";
import { createTokenStore } from "./tokenStore";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe("tokenStore", () => {
  it("stores, reads and clears the token", () => {
    const s = createTokenStore(memory());
    expect(s.get()).toBeNull();
    s.set("abc");
    expect(s.get()).toBe("abc");
    s.clear();
    expect(s.get()).toBeNull();
  });

  it("tells subscribers about every change until they unsubscribe", () => {
    const s = createTokenStore(memory());
    const seen = vi.fn();
    const off = s.subscribe(seen);
    s.set("a");
    s.clear();
    off();
    s.set("b");
    expect(seen.mock.calls).toEqual([["a"], [null]]);
  });

  it("behaves as signed out when storage is missing or throws", () => {
    expect(createTokenStore(undefined).get()).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const s = createTokenStore(broken);
    expect(s.get()).toBeNull();
    expect(() => s.set("x")).not.toThrow();
    expect(() => s.clear()).not.toThrow();
  });
});

describe("token access", () => {
  it("nothing outside tokenStore touches the stored token directly", async () => {
    const { readdirSync, readFileSync, statSync } = await import("fs");
    const { join, relative } = await import("path");
    const root = join(__dirname, "..");
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/tokenStore/.test(name)) {
          if (/localStorage\.\w+Item\(\s*["']token["']/.test(readFileSync(full, "utf8")))
            bad.push(relative(root, full));
        }
      }
    };
    walk(root);
    expect(bad, "use tokenStore from config/tokenStore").toEqual([]);
  });
});
