import { describe, expect, it } from "vitest";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import { activeSectionId, byOrder, pageDropPosition, pagesInSection, pageTitle } from "./pageTree";

const page = (id: string, order: string, extra: Partial<PageTreeEntry> = {}): PageTreeEntry => ({
  id,
  section_id: "s1",
  order,
  title: id,
  icon: null,
  color: "default",
  archived: false,
  favorite: false,
  tags: [],
  excerpt: "",
  journal_date: null,
  todo: { open: 0, done: 0 },
  updated_at: "2026-11-20T00:00:00.000Z",
  ...extra,
});
const section = (id: string): XenNoteSection => ({
  id,
  notebook_id: "nb",
  name: id,
  color: "default",
  kind: "normal",
  order: id,
  created_at: "",
  updated_at: "",
});

describe("pagesInSection", () => {
  const pages = [
    page("b", "a1"),
    page("a", "a0"),
    page("old", "a2", { archived: true }),
    page("other", "a0", { section_id: "s2" }),
  ];

  it("lists a section's pages in order", () => {
    expect(pagesInSection(pages, "s1").map((page) => page.id)).toEqual(["a", "b"]);
  });

  it("leaves out archived pages unless asked", () => {
    expect(pagesInSection(pages, "s1", true).map((page) => page.id)).toEqual(["a", "b", "old"]);
  });
});

describe("byOrder", () => {
  it("breaks ties between equal keys by id", () => {
    expect([page("b", "a0"), page("a", "a0")].sort(byOrder).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("pageDropPosition", () => {
  const ids = ["a", "b", "c", "d"];

  it("places a page before or after the drop target", () => {
    expect(pageDropPosition(ids, "d", { id: "a", edge: "before" })).toEqual({ before: "a" });
    expect(pageDropPosition(ids, "a", { id: "d", edge: "after" })).toEqual({ after: "d" });
    expect(pageDropPosition(ids, "a", { id: "c", edge: "before" })).toEqual({ before: "c" });
  });

  it("ignores drops into the same spot or onto a page outside the visible list", () => {
    expect(pageDropPosition(ids, "b", { id: "b", edge: "before" })).toBeNull();
    expect(pageDropPosition(ids, "b", { id: "a", edge: "after" })).toBeNull();
    expect(pageDropPosition(ids, "b", { id: "c", edge: "before" })).toBeNull();
    expect(pageDropPosition(ids, "b", { id: "gone", edge: "after" })).toBeNull();
    expect(pageDropPosition(ids, "gone", { id: "a", edge: "after" })).toBeNull();
  });
});

describe("activeSectionId", () => {
  const sections = [section("s1"), section("s2")];
  const pages = [page("p1", "a0", { section_id: "s2" })];

  it("shows the section of the open page first", () => {
    expect(activeSectionId(sections, pages, "p1", "s1")).toBe("s2");
  });

  it("then the one chosen, if it still exists, then the first", () => {
    expect(activeSectionId(sections, pages, undefined, "s2")).toBe("s2");
    expect(activeSectionId(sections, pages, undefined, "gone")).toBe("s1");
    expect(activeSectionId(sections, pages, "missing", null)).toBe("s1");
  });

  it("is null for a notebook with no sections", () => {
    expect(activeSectionId([], [], undefined, null)).toBeNull();
  });
});

describe("pageTitle", () => {
  it("shows Untitled for an empty title", () => {
    expect(pageTitle("  ")).toBe("Untitled");
    expect(pageTitle(" Plan ")).toBe("Plan");
  });
});
