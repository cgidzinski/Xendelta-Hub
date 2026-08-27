import { describe, it, expect } from "vitest";
import { csvCell, csvLine } from "./csvWriter";

describe("csvCell", () => {
  it("quotes every value", () => {
    expect(csvCell("NETFLIX")).toBe('"NETFLIX"');
    expect(csvCell(16.99)).toBe('"16.99"');
  });

  it("escapes embedded quotes by doubling them", () => {
    expect(csvCell('SAY "HI"')).toBe('"SAY ""HI"""');
  });

  it("needs no special handling for a comma or a newline, since every field is quoted", () => {
    expect(csvCell("GROCERIES, INC")).toBe('"GROCERIES, INC"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as empty rather than as the words", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it("keeps a zero rather than blanking it", () => {
    expect(csvCell(0)).toBe('"0"');
  });
});

describe("csvLine", () => {
  it("joins the fields and terminates with CRLF", () => {
    expect(csvLine(["2026-08-15", "NETFLIX", 16.99]))
      .toBe('"2026-08-15","NETFLIX","16.99"\r\n');
  });

  it("writes an empty record for no fields", () => {
    expect(csvLine([])).toBe("\r\n");
  });
});
