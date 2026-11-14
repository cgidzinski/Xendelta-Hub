import { describe, it, expect } from "vitest";
import { accessFromOverrides, overridesFromAccess } from "./communityAccess";

describe("channel access presets", () => {
  it("open has no overrides", () => {
    expect(overridesFromAccess({ mode: "open", roleIds: ["r1"] }, "e")).toEqual([]);
  });

  it("read-only denies everyone sending, and lets chosen roles post", () => {
    expect(overridesFromAccess({ mode: "readonly", roleIds: ["mod"] }, "e")).toEqual([
      { roleId: "e", allow: [], deny: ["sendMessages"] },
      { roleId: "mod", allow: ["sendMessages"], deny: [] },
    ]);
  });

  it("private denies everyone reading, and lets chosen roles read and post", () => {
    expect(overridesFromAccess({ mode: "private", roleIds: ["mod", "mod", "e"] }, "e")).toEqual([
      { roleId: "e", allow: [], deny: ["readMessages"] },
      { roleId: "mod", allow: ["readMessages", "sendMessages"], deny: [] },
    ]);
  });

  it("reads back what it wrote", () => {
    for (const choice of [
      { mode: "open" as const, roleIds: [] },
      { mode: "readonly" as const, roleIds: ["a", "b"] },
      { mode: "private" as const, roleIds: ["a"] },
      { mode: "private" as const, roleIds: [] },
    ]) {
      const back = accessFromOverrides(overridesFromAccess(choice, "e"), "e");
      expect(back).toEqual({ access: choice.mode, roleIds: choice.roleIds });
    }
  });

  it("calls anything else custom, so it isn't silently rewritten", () => {
    expect(accessFromOverrides([{ roleId: "mod", allow: ["pinMessages"], deny: [] }], "e").access).toBe("custom");
    expect(accessFromOverrides([{ roleId: "e", allow: ["pinMessages"], deny: ["readMessages"] }], "e").access).toBe(
      "custom",
    );
    expect(accessFromOverrides([{ roleId: "e", allow: [], deny: ["readMessages", "sendMessages"] }], "e").access).toBe(
      "custom",
    );
    expect(
      accessFromOverrides(
        [
          { roleId: "e", allow: [], deny: ["sendMessages"] },
          { roleId: "mod", allow: ["sendMessages"], deny: ["pinMessages"] },
        ],
        "e",
      ).access,
    ).toBe("custom");
  });
});
