import { describe, it, expect } from "vitest";
import { SLUG_PATTERN, normalizeDestination } from "./xenlink";

describe("normalizeDestination", () => {
  it("keeps web addresses and adds https:// when the scheme is missing", () => {
    expect(normalizeDestination("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(normalizeDestination("http://example.com")).toBe("http://example.com");
    expect(normalizeDestination("example.com")).toBe("https://example.com");
    expect(normalizeDestination("  www.example.com/path  ")).toBe("https://www.example.com/path");
    expect(normalizeDestination("//example.com/x")).toBe("https://example.com/x");
    expect(normalizeDestination("HTTPS://Example.COM")).toBe("HTTPS://Example.COM");
  });

  it("treats a host with a port as a host, not a scheme", () => {
    expect(normalizeDestination("localhost:3000/x")).toBe("https://localhost:3000/x");
    expect(normalizeDestination("example.com:8080")).toBe("https://example.com:8080");
  });

  it("refuses every other scheme", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "mailto:a@b.example",
      "tel:+15551234",
      "ftp://example.com/x",
      "vbscript:x",
      "blob:https://example.com/1",
      "about:blank",
    ]) {
      expect(normalizeDestination(bad), bad).toBeNull();
    }
  });

  it("refuses what isn't an address", () => {
    for (const bad of [
      "",
      "   ",
      "has space.com",
      "https://",
      "http://exa mple.com",
      "https://user:pw@example.com",
      "a".repeat(3000),
      "https://a.example/\u0000x",
    ]) {
      expect(normalizeDestination(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("SLUG_PATTERN", () => {
  it("accepts short readable names", () => {
    for (const ok of ["menu", "my-trip_2026", "abc", "a1b2c3", "0day", "x".repeat(40)])
      expect(SLUG_PATTERN.test(ok), ok).toBe(true);
  });
  it("refuses the rest", () => {
    for (const bad of ["ab", "", "-abc", "_abc", "Menu", "my trip", "a/b", "a.b", "é-menu", "x".repeat(41)])
      expect(SLUG_PATTERN.test(bad), bad).toBe(false);
  });
});
