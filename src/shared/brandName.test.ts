import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { BRAND_NAME } from "./brand";

// The product is called XenSuite and spelled one way. It used to be spelled five ways (Xendelta Hub, XenDelta Hub, XenDelta,
// XenHub, Xendelta), and "Xensplit" next to "XenSplit". Type BRAND_NAME (src/shared/brand.ts) instead of the name.
//
// Deliberately NOT renamed, and so not matched here: the domain xendelta.com, the API key prefix xd_, the database and backup
// file names (xendelta-hub-backup), the browser storage keys (xendelta:theme, xendelta-share) and the import user agent
// (XendeltaHub-RecipeImport). Renaming those would break existing installs, links, keys and backups.
const OLD_SPELLINGS: Array<[RegExp, string]> = [
  [/Xendelta Hub/, "Xendelta Hub"],
  [/XenDelta/, "XenDelta"],
  [/XenHub/, "XenHub"],
  [/\bXendelta\b(?!\.com|-)/, "Xendelta"],
  [/["'`>]Xensplit["'`<]/, "Xensplit (the app is XenSplit)"],
];

const SRC = join(__dirname, "..");
const ROOT = join(SRC, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|md|html|webmanifest)$/.test(name)) out.push(full);
  }
  return out;
}

describe("the product name", () => {
  it("is XenSuite", () => {
    expect(BRAND_NAME).toBe("XenSuite");
  });

  it("is never spelled the old ways", () => {
    const files = [...walk(SRC), join(ROOT, "index.html"), join(ROOT, "public", "site.webmanifest")].filter(
      (f) => !f.endsWith("brandName.test.ts"),
    );
    const found: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const rel = relative(ROOT, file);
      for (const [pattern, label] of OLD_SPELLINGS) {
        if (pattern.test(text)) found.push(`${rel}: ${label}`);
      }
    }
    expect(found, "use BRAND_NAME from src/shared/brand.ts").toEqual([]);
  });
});
