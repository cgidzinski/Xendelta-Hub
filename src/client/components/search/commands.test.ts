import { describe, expect, it } from "vitest";
import { COMMANDS, matchCommands } from "./commands";

describe("palette commands", () => {
  it("lists everything for an empty search", () => {
    expect(matchCommands("   ")).toEqual(COMMANDS);
  });

  it("matches words in any order, in the label or the keywords, ignoring case", () => {
    expect(matchCommands("XENSPLIT").map((c) => c.label)).toContain("XenSplit");
    expect(matchCommands("gems").map((c) => c.label)).toEqual(expect.arrayContaining(["Billing", "Shop"]));
    expect(matchCommands("email account").map((c) => c.label)).toEqual(["Settings"]);
    expect(matchCommands("nothing like this")).toEqual([]);
  });

  it("puts a label that starts with the search before one that only mentions it", () => {
    const labels = matchCommands("shop").map((c) => c.label);
    expect(labels[0]).toBe("Shop");
  });

  it("has an app command for every app, going to that app", () => {
    for (const c of COMMANDS.filter((c) => c.id.startsWith("app:"))) {
      expect(c.path).toMatch(/^\/internal\/[a-z]+$/);
    }
    expect(COMMANDS.filter((c) => c.id.startsWith("app:")).length).toBeGreaterThanOrEqual(7);
  });
});
