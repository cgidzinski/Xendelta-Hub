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

describe("every app has an invitation", () => {
  it("says to try the app in one line, and the hub has none", () => {
    for (const app of GUIDE_APPS) {
      const pitch = APP_GUIDE[app].pitch;
      if (app === "hub") {
        expect(pitch).toBeUndefined();
        continue;
      }
      expect(pitch?.text.startsWith("Try "), app).toBe(true);
      expect(pitch?.text.endsWith("."), app).toBe(true);
      expect(pitch?.link?.startsWith("/internal/"), app).toBe(true);
    }
  });
});

describe("pickTips", () => {
  const apps = GUIDE_APPS.filter((a) => a !== "hub");
  const used = (...a: string[]) => new Set(a);

  it("gives the same tips for the same seed, and different ones for another day", () => {
    expect(pickTips("2026-11-13", 3)).toEqual(pickTips("2026-11-13", 3));
    const days = new Set(
      Array.from({ length: 12 }, (_, i) =>
        pickTips(`2026-11-${10 + i}`, 3, { used: used("xennote", "xenkitchen", "xendrive") })
          .map((t) => t.text)
          .join("|"),
      ),
    );
    expect(days.size).toBeGreaterThan(3);
  });

  it("someone who uses nothing only gets invitations, from different apps", () => {
    const tips = pickTips("seed", 3);
    expect(tips).toHaveLength(3);
    expect(tips.every((t) => t.kind === "try")).toBe(true);
    expect(new Set(tips.map((t) => t.app)).size).toBe(3);
  });

  it("never invites someone to an app they already use, and never gives tricks for one they don't", () => {
    const inUse = used("xennote", "xenkitchen", "xensplit");
    for (let i = 0; i < 20; i++) {
      for (const tip of pickTips(`seed-${i}`, 6, { used: inUse })) {
        if (tip.kind === "try") expect(inUse.has(tip.app), tip.text).toBe(false);
        if (tip.kind === "feature") expect(tip.app === "hub" || inUse.has(tip.app), tip.text).toBe(true);
      }
    }
  });

  it("invitations come first, and tips about apps in use only fill what is left", () => {
    const nearlyAll = used(...apps.filter((a) => a !== "xenlink" && a !== "recipaint"));
    const tips = pickTips("seed", 3, { used: nearlyAll });
    expect(tips.map((t) => t.kind)).toEqual(["try", "try", "feature"]);
    expect(
      tips
        .slice(0, 2)
        .map((t) => t.app)
        .sort(),
    ).toEqual(["recipaint", "xenlink"]);
  });

  it("someone who uses everything gets tips about the apps they use", () => {
    const tips = pickTips("seed", 3, { used: used(...apps) });
    expect(tips).toHaveLength(3);
    expect(tips.every((t) => t.kind === "feature")).toBe(true);
    expect(new Set(tips.map((t) => `${t.app}:${t.text}`)).size).toBe(3);
  });

  it("with the feed filtered to an app: an invitation if they don't use it, its tips if they do", () => {
    const invite = pickTips("seed", 3, { app: "xenkitchen" });
    expect(invite).toHaveLength(1);
    expect(invite[0]).toMatchObject({ kind: "try", app: "xenkitchen" });
    const features = pickTips("seed", 3, { app: "xenkitchen", used: used("xenkitchen") });
    expect(features.length).toBeGreaterThan(1);
    expect(features.every((t) => t.kind === "feature" && t.app === "xenkitchen")).toBe(true);
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
      const text = entry.title;
      expect(entry.title.length, entry.title).toBeLessThan(100);
      expect(text, entry.title).not.toMatch(/#\d{2,}|\.tsx?\b|\bAPI\b|\bendpoint\b|\bmigration\b|\brefactor/i);
    }
  });
});
