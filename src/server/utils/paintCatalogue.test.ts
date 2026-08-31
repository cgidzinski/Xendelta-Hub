import { describe, it, expect } from "vitest";
import { PAINT_TYPES, catalogueKey } from "../../shared/recipaint/paints";
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  catalogueSize,
  getCataloguePaint,
  listCatalogueBrands,
  searchCatalogue,
} from "./paintCatalogue";
import type { CataloguePaint } from "./paintCatalogue";
import committedJson from "../data/paintCatalogue.json";

const committed = committedJson as CataloguePaint[];

// The catalogue is generated and committed, so a bad regeneration should fail here rather
// than in production.
describe("the committed catalogue", () => {
  it("is present and non-trivial", () => {
    expect(catalogueSize()).toBeGreaterThan(2000);
  });

  // Asserted against the file rather than through searchCatalogue, which is capped and so
  // could never see a duplicate near the end of 2,164 rows.
  it("has no duplicate keys", () => {
    const keys = new Set(committed.map((paint) => paint.key));
    expect(keys.size).toBe(committed.length);
  });

  it("has a key, brand, name and hex on every entry", () => {
    const broken = committed.filter((p) => !p.key || !p.brand || !p.name || !/^#[0-9A-F]{6}$/i.test(p.hex));
    expect(broken.slice(0, 5)).toEqual([]);
  });

  it("stores a search string that actually contains the brand and name", () => {
    const wrong = committed.filter(
      (p) => !p.search.includes(p.brand.toLowerCase()) || !p.search.includes(p.name.toLowerCase()),
    );
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("carries the brands that were selected", () => {
    expect(listCatalogueBrands()).toEqual(["Army Painter", "Citadel Colour", "Scale75", "Vallejo"]);
  });

  it("only uses types the Paint schema enum accepts", () => {
    const allowed = new Set<string>([...PAINT_TYPES, ""]);
    const invalid = committed.filter((p) => !allowed.has(p.type));
    expect(invalid.slice(0, 5)).toEqual([]);
  });

  it("keys every entry exactly as catalogueKey would", () => {
    const mismatched = committed.filter((p) => p.key !== catalogueKey(p));
    expect(mismatched.slice(0, 5)).toEqual([]);
  });

  it("keeps one name that exists in two ranges as two entries", () => {
    // The property the range-aware key exists for.
    const purples = searchCatalogue({ q: "warlock purple", limit: 10 });
    expect(purples.length).toBeGreaterThan(1);
    expect(new Set(purples.map((p) => p.range)).size).toBeGreaterThan(1);
    expect(new Set(purples.map((p) => p.hex)).size).toBeGreaterThan(1);
  });

  it("stores keys that match catalogueKey", () => {
    const [paint] = searchCatalogue({ q: "nuln oil", limit: 1 });
    expect(paint).toBeDefined();
    expect(paint.key).toBe(catalogueKey(paint));
  });
});

describe("searchCatalogue", () => {
  it("matches on name", () => {
    const results = searchCatalogue({ q: "nuln oil" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.search.includes("nuln oil"))).toBe(true);
  });

  it("matches on brand and on range", () => {
    expect(searchCatalogue({ q: "citadel" }).length).toBeGreaterThan(0);
    expect(searchCatalogue({ q: "warpaints air" }).length).toBeGreaterThan(0);
  });

  it("is case-insensitive and ignores surrounding space", () => {
    const a = searchCatalogue({ q: "  NULN Oil " });
    const b = searchCatalogue({ q: "nuln oil" });
    expect(a.map((p) => p.key)).toEqual(b.map((p) => p.key));
  });

  it("filters by brand", () => {
    const results = searchCatalogue({ brand: "Citadel Colour", limit: 50 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.brand === "Citadel Colour")).toBe(true);
  });

  it("respects the limit and never returns the whole catalogue", () => {
    expect(searchCatalogue({ limit: 5 })).toHaveLength(5);
    // An empty query is a bounded page, not an export of all 2,164.
    expect(searchCatalogue({}).length).toBeLessThan(catalogueSize());
    expect(searchCatalogue({ limit: 10_000 })).toHaveLength(MAX_SEARCH_LIMIT);
  });

  it("falls back to the default for a nonsense limit rather than throwing", () => {
    for (const limit of [0, -5, NaN, Infinity, undefined]) {
      expect(searchCatalogue({ limit }).length, `limit=${limit}`).toBe(DEFAULT_SEARCH_LIMIT);
    }
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchCatalogue({ q: "zzzz-not-a-paint" })).toEqual([]);
  });
});

describe("getCataloguePaint", () => {
  it("round-trips a key from search", () => {
    const [paint] = searchCatalogue({ q: "macragge", limit: 1 });
    expect(getCataloguePaint(paint.key)).toEqual(paint);
  });

  it("returns null for an unknown key", () => {
    expect(getCataloguePaint("nope")).toBeNull();
    expect(getCataloguePaint("")).toBeNull();
  });
});
