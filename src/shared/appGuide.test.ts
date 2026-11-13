import { describe, it, expect } from "vitest";
import { APP_GUIDE, GUIDE_APPS, pickTips } from "./appGuide";
import { CHANGELOG } from "./changelog";

describe("the app guide", () => {
  it("has a few plain lines and at least three tips for every app", () => {
    for (const app of GUIDE_APPS) {
      const entry = APP_GUIDE[app];
      expect(entry.about.length, app).toBeGreaterThan(40);
      expect(entry.about.length, app).toBeLessThan(300);
      expect(entry.tips.length, app).toBeGreaterThanOrEqual(app === "hub" ? 3 : 2);
      for (const tip of entry.tips) {
        expect(tip.text.endsWith("."), tip.text).toBe(true);
        if (tip.link) expect(tip.link.startsWith("/internal"), tip.link).toBe(true);
      }
    }
  });
});

describe("pickTips", () => {
  it("gives the same tips for the same seed, and different ones for another day", () => {
    expect(pickTips("2026-11-13", 3)).toEqual(pickTips("2026-11-13", 3));
    const days = new Set(
      Array.from({ length: 12 }, (_, i) =>
        pickTips(`2026-11-${10 + i}`, 3)
          .map((t) => t.text)
          .join("|"),
      ),
    );
    expect(days.size).toBeGreaterThan(3);
  });
  it("returns the number asked for, from different apps, with no repeats", () => {
    const tips = pickTips("seed", 3);
    expect(tips).toHaveLength(3);
    expect(new Set(tips.map((t) => t.app)).size).toBe(3);
    const many = pickTips("seed", 100);
    expect(new Set(many.map((t) => `${t.app}:${t.text}`)).size).toBe(many.length);
  });
  it("only uses one app's tips when asked for one", () => {
    const tips = pickTips("seed", 3, "xenkitchen");
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((t) => t.app === "xenkitchen")).toBe(true);
  });
});

describe("the changelog", () => {
  it("is newest first, with real dates and known apps", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date, entry.title).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(entry.date)), entry.title).toBe(false);
      expect(GUIDE_APPS as readonly string[], entry.title).toContain(entry.app);
    }
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
  it("is written for people: short, no PR numbers, no file names or code words", () => {
    for (const entry of CHANGELOG) {
      const text = `${entry.title} ${entry.detail ?? ""}`;
      expect(entry.title.length, entry.title).toBeLessThan(100);
      expect(text, entry.title).not.toMatch(/#\d{2,}|\.tsx?\b|\bAPI\b|\bendpoint\b|\bmigration\b|\brefactor/i);
    }
  });
});
