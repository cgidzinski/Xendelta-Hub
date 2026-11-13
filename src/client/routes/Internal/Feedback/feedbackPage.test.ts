import { describe, it, expect } from "vitest";
import { pageFromParam } from "./feedbackPage";

describe("pageFromParam", () => {
  it("keeps a page in the app", () => {
    expect(pageFromParam("/internal/xennote")).toBe("/internal/xennote");
    expect(pageFromParam("/internal/xenbudget/books/1/items?x=1")).toBe("/internal/xenbudget/books/1/items?x=1");
    expect(pageFromParam("/admin/users")).toBe("/admin/users");
  });
  it("drops anything else, including the feedback page itself", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example/",
      "//evil.example",
      "/login",
      "/internal/feedback",
      "/internalx",
    ]) {
      expect(pageFromParam(bad as string | null), String(bad)).toBeUndefined();
    }
    expect(pageFromParam(`/internal/${"a".repeat(400)}`)).toBeUndefined();
  });
});
