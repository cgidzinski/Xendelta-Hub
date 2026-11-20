import { describe, expect, it } from "vitest";
import { flagFromParam } from "./useNotebookPagesFlag";

describe("flagFromParam", () => {
  it("turns the view on or off when asked, and leaves it alone otherwise", () => {
    expect(flagFromParam("on")).toBe(true);
    expect(flagFromParam("off")).toBe(false);
    expect(flagFromParam(null)).toBeNull();
    expect(flagFromParam("")).toBeNull();
    expect(flagFromParam("yes")).toBeNull();
  });
});
