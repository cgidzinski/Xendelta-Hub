import { describe, expect, it } from "vitest";
import { SLASH_ITEMS, filterSlashItems } from "./slashItems";

const ids = (query: string) => filterSlashItems(query).map((i) => i.id);

describe("filterSlashItems", () => {
  it("shows every block when nothing is typed", () => {
    expect(filterSlashItems("")).toHaveLength(SLASH_ITEMS.length);
    expect(filterSlashItems("  ")).toHaveLength(SLASH_ITEMS.length);
  });

  it("finds a block by the start of its name, ignoring case", () => {
    expect(ids("head")).toEqual(["heading1", "heading2", "heading3"]);
    expect(ids("TABLE")).toEqual(["table"]);
  });

  it("finds a block by another word for it", () => {
    expect(ids("todo")).toEqual(["taskList"]);
    expect(ids("photo")).toEqual(["file"]);
    expect(ids("h2")).toEqual(["heading2"]);
  });

  it("needs every word to match", () => {
    expect(ids("number list")).toEqual(["orderedList"]);
    expect(ids("heading zebra")).toEqual([]);
  });

  it("puts names that start with the text before ones that only have a keyword for it", () => {
    // "note" starts nothing's title but is a keyword of the callout; "quote" has no "note".
    expect(ids("code")[0]).toBe("codeBlock");
    expect(ids("l")).toContain("taskList");
  });

  it("finds nothing for something that isn't there", () => {
    expect(ids("zzz")).toEqual([]);
  });

  it("has a unique id, a title and a description for every block", () => {
    expect(new Set(SLASH_ITEMS.map((i) => i.id)).size).toBe(SLASH_ITEMS.length);
    for (const item of SLASH_ITEMS) {
      expect(item.title).toBeTruthy();
      expect(item.description).toBeTruthy();
    }
  });
});
