import { describe, it, expect } from "vitest";
import { appBarHeight, chatShellStyle } from "./chatLayout";

const viewport = (o: Partial<{ height: number; offsetTop: number; width: number }> = {}) => ({
  height: 800,
  offsetTop: 0,
  width: 390,
  ...o,
});

describe("chat screen placement", () => {
  it("matches the app bar's height", () => {
    expect(appBarHeight(390, false)).toBe(56);
    expect(appBarHeight(700, true)).toBe(64);
    expect(appBarHeight(500, true)).toBe(48);
    expect(appBarHeight(1280, false)).toBe(64);
  });

  it("fills the space under the app bar on a computer, and scrolls inside", () => {
    const style = chatShellStyle({
      phone: false,
      inThread: true,
      viewport: viewport({ width: 1280 }),
      landscape: true,
      zIndex: 1200,
    });
    expect(style).toEqual({ height: "calc(100dvh - 64px)", overflow: "hidden" });
  });

  it("pins the list to the visible area under the app bar on a phone", () => {
    const style = chatShellStyle({
      phone: true,
      inThread: false,
      viewport: viewport(),
      landscape: false,
      zIndex: 1200,
    }) as any;
    expect(style).toMatchObject({ position: "fixed", top: 56, height: 744, overflow: "hidden" });
    expect(style.zIndex).toBeUndefined();
  });

  it("makes an open chat cover the whole screen, above the app bar", () => {
    const style = chatShellStyle({
      phone: true,
      inThread: true,
      viewport: viewport(),
      landscape: false,
      zIndex: 1250,
    }) as any;
    expect(style).toMatchObject({ position: "fixed", top: 0, height: 800, zIndex: 1250 });
  });

  it("follows the keyboard: a shorter visible area, and an iOS scroll offset", () => {
    const shown = chatShellStyle({
      phone: true,
      inThread: true,
      viewport: viewport({ height: 450, offsetTop: 120 }),
      landscape: false,
      zIndex: 1250,
    }) as any;
    expect(shown).toMatchObject({ top: 120, height: 450 });
  });
});
