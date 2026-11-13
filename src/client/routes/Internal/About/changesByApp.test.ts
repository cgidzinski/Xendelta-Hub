import { describe, it, expect } from "vitest";
import type { ChangelogEntry } from "@shared/changelog";
import { GUIDE_APPS } from "@shared/appGuide";
import { changesByApp } from "./changesByApp";

const e = (date: string, app: ChangelogEntry["app"], title: string): ChangelogEntry => ({ date, app, title });

describe("changesByApp", () => {
  it("has a group for every app, the hub first, even when an app has no changes", () => {
    const groups = changesByApp([]);
    expect(groups.map((g) => g.app)).toEqual([...GUIDE_APPS]);
    expect(groups[0].app).toBe("hub");
    expect(groups.every((g) => g.entries.length === 0)).toBe(true);
  });
  it("puts each change under its own app and keeps their order (newest first)", () => {
    const entries = [e("2026-02-01", "xennote", "B"), e("2026-01-15", "hub", "H"), e("2026-01-01", "xennote", "A")];
    const groups = Object.fromEntries(changesByApp(entries).map((g) => [g.app, g.entries.map((x) => x.title)]));
    expect(groups.xennote).toEqual(["B", "A"]);
    expect(groups.hub).toEqual(["H"]);
    expect(groups.xenkitchen).toEqual([]);
  });
});
