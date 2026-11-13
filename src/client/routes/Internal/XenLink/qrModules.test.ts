import { describe, it, expect } from "vitest";
import { qrPath, qrSvgFile, QR_BORDER } from "./qrModules";

// The cells a path draws, read back from its "M<col> <row>h<run>v1..." runs.
const cells = (d: string) => {
  const set = new Set<string>();
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1/g)) {
    for (let i = 0; i < Number(m[3]); i++) set.add(`${Number(m[1]) + i},${m[2]}`);
  }
  return set;
};

describe("qrPath", () => {
  it("makes a square code with the three finder squares in the corners", () => {
    const { count, d } = qrPath("https://hub.example/x/menu");
    expect(count).toBeGreaterThanOrEqual(21);
    expect((count - 17) % 4).toBe(0); // a real QR size: 21, 25, 29...
    const dark = cells(d);
    // the 7x7 finder pattern: a dark outline, a light ring, a dark 3x3 centre
    for (const [r0, c0] of [
      [0, 0],
      [0, count - 7],
      [count - 7, 0],
    ]) {
      for (let i = 0; i < 7; i++) {
        for (const [r, c] of [
          [r0, c0 + i],
          [r0 + 6, c0 + i],
          [r0 + i, c0],
          [r0 + i, c0 + 6],
        ]) {
          expect(dark.has(`${c},${r}`), `outline ${r},${c}`).toBe(true);
        }
      }
      expect(dark.has(`${c0 + 3},${r0 + 3}`)).toBe(true); // centre
      expect(dark.has(`${c0 + 1},${r0 + 1}`)).toBe(false); // light ring
    }
  });

  it("is the same every time and differs for different text", () => {
    expect(qrPath("https://hub.example/x/a").d).toBe(qrPath("https://hub.example/x/a").d);
    expect(qrPath("https://hub.example/x/a").d).not.toBe(qrPath("https://hub.example/x/b").d);
  });

  it("gets bigger for longer text", () => {
    expect(qrPath("https://hub.example/x/" + "a".repeat(120)).count).toBeGreaterThan(
      qrPath("https://a.example/x").count,
    );
  });
});

describe("qrSvgFile", () => {
  it("is a self-contained black-on-white SVG with a quiet border, and nothing from the text in it", () => {
    const svg = qrSvgFile('https://hub.example/x/"><script>alert(1)</script>');
    const { count } = qrPath('https://hub.example/x/"><script>alert(1)</script>');
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${count + QR_BORDER * 2} ${count + QR_BORDER * 2}"`);
    expect(svg).toContain('fill="white"');
    expect(svg).toContain('fill="black"');
    expect(svg).not.toMatch(/script|alert/);
  });
});
