import { describe, it, expect } from "vitest";
import { filterLinks, sortLinks } from "./linkView";
import type { XenLink } from "../../../hooks/xenlink/useXenlink";

const link = (over: Partial<XenLink>): XenLink => ({
  _id: "1",
  name: "Link",
  url: "https://example.com",
  slug: "abc",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...over,
});

describe("filterLinks", () => {
  const links = [link({ _id: "1", name: "Summer party", slug: "party" }), link({ _id: "2", url: "https://docs.dev" })];
  it("keeps everything for an empty search", () => expect(filterLinks(links, "  ")).toHaveLength(2));
  it("matches name, address and short name, every word", () => {
    expect(filterLinks(links, "summer").map((l) => l._id)).toEqual(["1"]);
    expect(filterLinks(links, "DOCS").map((l) => l._id)).toEqual(["2"]);
    expect(filterLinks(links, "summer party").map((l) => l._id)).toEqual(["1"]);
    expect(filterLinks(links, "summer docs")).toEqual([]);
  });
});

describe("sortLinks", () => {
  const a = link({ _id: "a", name: "Bravo", clicks: 5, createdAt: new Date("2026-01-01") });
  const b = link({ _id: "b", name: "Alpha", clicks: 9, createdAt: new Date("2026-02-01"), expires_at: "2026-03-01" });
  const c = link({ _id: "c", name: "Charlie", clicks: 0, createdAt: new Date("2026-03-01"), expires_at: "2026-02-01" });
  const ids = (l: XenLink[]) => l.map((x) => x._id);
  it("sorts by age", () => {
    expect(ids(sortLinks([c, a, b], "oldest"))).toEqual(["a", "b", "c"]);
    expect(ids(sortLinks([a, b, c], "newest"))).toEqual(["c", "b", "a"]);
  });
  it("sorts by clicks and name", () => {
    expect(ids(sortLinks([a, b, c], "clicks"))).toEqual(["b", "a", "c"]);
    expect(ids(sortLinks([a, b, c], "name"))).toEqual(["b", "a", "c"]);
  });
  it("puts links with the earliest expiry first and never-expiring ones last", () => {
    expect(ids(sortLinks([a, b, c], "expiry"))).toEqual(["c", "b", "a"]);
  });
  it("does not change the list it is given", () => {
    const input = [c, a, b];
    sortLinks(input, "name");
    expect(ids(input)).toEqual(["c", "a", "b"]);
  });
});
