import { describe, expect, it } from "vitest";
import { MAX_PAGE_DOC_BYTES, MAX_TAG_LENGTH, isJournalDate, normalizeTag } from "./pages";

describe("normalizeTag", () => {
  it("drops the hash, lower-cases and joins words with a dash", () => {
    expect(normalizeTag("#Q4 Planning")).toBe("q4-planning");
    expect(normalizeTag("##Recipes")).toBe("recipes");
  });

  it("keeps letters from any language, digits, underscores and slashes", () => {
    expect(normalizeTag("Café_2027/trip")).toBe("café_2027/trip");
    expect(normalizeTag("日本語")).toBe("日本語");
  });

  it("collapses punctuation and trims dashes", () => {
    expect(normalizeTag("  --a!!b--  ")).toBe("a-b");
    expect(normalizeTag("###")).toBe("");
  });

  it("cuts to the limit", () => {
    expect(normalizeTag("x".repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("isJournalDate", () => {
  it("accepts real dates only", () => {
    expect(isJournalDate("2026-11-20")).toBe(true);
    expect(isJournalDate("2028-02-29")).toBe(true);
    expect(isJournalDate("2027-02-29")).toBe(false);
    expect(isJournalDate("2026-13-01")).toBe(false);
    expect(isJournalDate("20-11-2026")).toBe(false);
    expect(isJournalDate("")).toBe(false);
  });
});

describe("limits", () => {
  it("leave a wide margin under MongoDB's 16 MB document cap", () => {
    expect(MAX_PAGE_DOC_BYTES).toBeLessThan((16 * 1024 * 1024) / 8);
  });
});
