import { describe, it, expect } from "vitest";
import { ETRANSFER_MAX, isValidEtransfer, normalizeEtransfer } from "./etransfer";

describe("isValidEtransfer", () => {
  it("accepts email addresses", () => {
    expect(isValidEtransfer("jane@example.com")).toBe(true);
    expect(isValidEtransfer("  jane.doe+split@sub.example.co.uk  ")).toBe(true);
  });

  it("accepts phone numbers however they're punctuated", () => {
    expect(isValidEtransfer("4165550123")).toBe(true);
    expect(isValidEtransfer("416 555 0123")).toBe(true);
    expect(isValidEtransfer("(416) 555-0123")).toBe(true);
    expect(isValidEtransfer("+1 416-555-0123")).toBe(true);
  });

  it("rejects too-short and too-long digit strings", () => {
    expect(isValidEtransfer("555 0123")).toBe(false);
    expect(isValidEtransfer("1234567890123456")).toBe(false);
  });

  it("rejects anything that is neither", () => {
    expect(isValidEtransfer("nonsense")).toBe(false);
    expect(isValidEtransfer("jane@example")).toBe(false);
    expect(isValidEtransfer("jane @example.com")).toBe(false);
    expect(isValidEtransfer("")).toBe(false);
    expect(isValidEtransfer("   ")).toBe(false);
  });

  it("rejects a handle longer than the stored maximum", () => {
    expect(isValidEtransfer(`${"a".repeat(ETRANSFER_MAX)}@example.com`)).toBe(false);
  });
});

describe("normalizeEtransfer", () => {
  it("lowercases emails", () => {
    expect(normalizeEtransfer("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });

  it("leaves phone formatting alone", () => {
    expect(normalizeEtransfer(" (416) 555-0123 ")).toBe("(416) 555-0123");
  });
});
