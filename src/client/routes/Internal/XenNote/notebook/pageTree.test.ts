import { describe, expect, it } from "vitest";
import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";
import {
  activeSectionId,
  byOrder,
  moveNeighbour,
  pageNodes,
  pageTitle,
  previousTopLevel,
  siblingsOf,
} from "./pageTree";

const page = (id: string, order: string, extra: Partial<PageTreeEntry> = {}): PageTreeEntry => ({
  id,
  section_id: "s1",
  parent_id: null,
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

describe("pageNodes", () => {
  const pages = [
    page("b", "a1"),
    page("a", "a0"),
    page("a-2", "a1", { parent_id: "a" }),
    page("a-1", "a0", { parent_id: "a" }),
    page("old", "a2", { archived: true }),
    page("other", "a0", { section_id: "s2" }),
  ];

  it("lists a section's top-level pages in order, each with its sub-pages in order", () => {
    const nodes = pageNodes(pages, "s1");
    expect(nodes.map((n) => n.page.id)).toEqual(["a", "b"]);
    expect(nodes[0].children.map((c) => c.id)).toEqual(["a-1", "a-2"]);
    expect(nodes[1].children).toEqual([]);
  });

  it("leaves out archived pages unless asked", () => {
    expect(pageNodes(pages, "s1", true).map((n) => n.page.id)).toEqual(["a", "b", "old"]);
  });

  it("leaves out an archived page's sub-pages with it", () => {
    const withArchivedParent = [page("p", "a0", { archived: true }), page("c", "a0", { parent_id: "p" })];
    expect(pageNodes(withArchivedParent, "s1")).toEqual([]);
  });
});

describe("byOrder", () => {
  it("breaks ties between equal keys by id", () => {
    expect([page("b", "a0"), page("a", "a0")].sort(byOrder).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("moving", () => {
  const pages = [page("a", "a0"), page("b", "a1"), page("c", "a2"), page("a-1", "a0", { parent_id: "a" })];

  it("finds the sibling a page goes before when it moves up, and after when it moves down", () => {
    expect(moveNeighbour(pages, pages[1], "up")).toEqual({ before: "a" });
    expect(moveNeighbour(pages, pages[1], "down")).toEqual({ after: "c" });
  });

  it("can't move past either end", () => {
    expect(moveNeighbour(pages, pages[0], "up")).toBeNull();
    expect(moveNeighbour(pages, pages[2], "down")).toBeNull();
  });

  it("only counts pages with the same parent as siblings", () => {
    expect(siblingsOf(pages, pages[3]).map((p) => p.id)).toEqual(["a-1"]);
    expect(moveNeighbour(pages, pages[3], "down")).toBeNull();
  });

  it("names the page a page would nest under", () => {
    expect(previousTopLevel(pages, pages[1])?.id).toBe("a");
    expect(previousTopLevel(pages, pages[0])).toBeNull();
    expect(previousTopLevel(pages, pages[3])).toBeNull();
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
