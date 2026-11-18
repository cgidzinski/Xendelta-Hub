import { describe, it, expect } from "vitest";
import { sortNotes } from "./noteSort";
import type { XenNote } from "../../../types/XenNote";

const n = (title: string, created_at: string, updated_at: string) => ({ title, created_at, updated_at }) as XenNote;

describe("sortNotes", () => {
  const list = [
    n("b", "2026-01-01", "2026-03-01"),
    n("", "2026-01-02", "2026-02-01"),
    n("a", "2026-01-03", "2026-01-15"),
  ];
  const titles = (s: Parameters<typeof sortNotes>[1]) => sortNotes(list, s).map((x) => x.title);

  it("sorts by last edit, creation or title, with untitled notes last by title", () => {
    expect(titles("edited")).toEqual(["b", "", "a"]);
    expect(titles("created")).toEqual(["a", "", "b"]);
    expect(titles("title")).toEqual(["a", "b", ""]);
  });
});
