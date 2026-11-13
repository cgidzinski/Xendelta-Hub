import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// Money is rounded and formatted in ONE place (shared/money.ts). Every hand-written copy was a
// chance for the client and server (or two apps) to round or display the same amount differently.
// This fails when a new copy appears; use roundMoney / roundMoneyExact / formatMoney instead.

const SRC = join(__dirname, "..");

/** Files that legitimately contain the pattern, and why. */
const ROUNDING_ALLOWED: Record<string, string> = {
  "shared/money.ts": "the implementation",
  "client/routes/Internal/XenBudget/components/ReviewModal.tsx": "splits a percentage (100 / n), not money",
  "client/routes/Internal/XenBudget/components/WeightedSplitEditor.tsx": "split weights and percentages, not money",
  "client/routes/Internal/XenKitchen/components/ItemView.tsx": "a recipe scaling factor, not money",
  "shared/xenkitchen/kitchen.ts": "recipe quantities, not money",
  "server/utils/recipeImport.ts": "recipe servings read from a page, not money",
  "shared/xenkitchen/units.ts": "recipe measures and temperatures, not money",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((f) => ({ rel: relative(SRC, f).split("\\").join("/"), text: readFileSync(f, "utf8") }));
const without = (allowed: Record<string, string>, matched: string[]) => matched.filter((f) => !(f in allowed));

describe("money conventions", () => {
  it("rounds money with roundMoney / roundMoneyExact, not by hand", () => {
    const handRolled = files
      .filter((f) => /Math\.round\(.*\* ?100\) ?\/ ?100|Number\(.*\.toFixed\(2\)\)/.test(f.text))
      .map((f) => f.rel);
    expect(
      without(ROUNDING_ALLOWED, handRolled),
      "use shared/money.ts (or add the file to ROUNDING_ALLOWED with a reason)",
    ).toEqual([]);
  });

  it("formats currency with formatMoney, not a fresh Intl.NumberFormat", () => {
    const adHoc = files.filter((f) => /new Intl\.NumberFormat\(/.test(f.text)).map((f) => f.rel);
    expect(without({ "shared/money.ts": "the implementation" }, adHoc), "use formatMoney from shared/money.ts").toEqual(
      [],
    );
  });

  it("keeps the allow-list honest (no entry for a file that no longer needs it)", () => {
    const stale = Object.keys(ROUNDING_ALLOWED).filter((rel) => {
      const f = files.find((x) => x.rel === rel);
      return !f || !/Math\.round\(.*\* ?100\) ?\/ ?100|Number\(.*\.toFixed\(2\)\)/.test(f.text);
    });
    expect(stale).toEqual([]);
  });
});
