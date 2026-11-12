import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guardrail for the design language (components/ui/DESIGN.md): pages take colours from the
// theme, not from hex / rgb() literals. Files that legitimately need literals are listed
// here with the reason; anything new that is not listed fails.

const ROOT = join(__dirname);
const COLOUR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|\brgba?\(/;

const ALLOWED: Record<string, string> = {
  "theme/index.ts": "defines the palette",
  "components/ui/chartColors.ts": "validated chart palette",
  "components/ui/surfaceStyles.ts": "image-overlay button tokens",
  "components/LoadingSpinner.tsx": "scrim over the page",
  "constants/xensplitCategoryIcons.tsx": "per-category identity colours",
  "constants/xensplit.ts": "per-category identity colours",
  "constants/xenbudget.ts": "label colour defaults",
  "routes/Internal/Profile/components/AuthButton.tsx": "third-party brand colours",
  "routes/External/Auth/Login.tsx": "Google/GitHub/Discord brand buttons",
  "routes/External/Auth/Signup.tsx": "Google/GitHub/Discord brand buttons",
  "routes/External/Auth/Reset.tsx": "Google/GitHub/Discord brand buttons",
  "routes/Internal/XenBudget/components/LabelColorPicker.tsx": "colour picker tracks",
  "routes/Internal/Recipaint/components/PaintFormDialog.tsx": "paint hex value",
  "routes/Internal/Xensplit/components/DebtWebChart.tsx": "SVG chart text fill",
};
// Photos need a scrim regardless of theme; these overlay buttons/gradients sit on imagery.
const ON_IMAGE_OVERLAY = [
  "routes/Internal/Inventory/Inventory.tsx",
  "routes/Internal/Shop/Shop.tsx",
  "routes/Internal/Recipaint/components/ImageGallery.tsx",
  "routes/Internal/Recipaint/components/ImageUploader.tsx",
  "routes/Internal/XenLink/components/LinkList.tsx",
  "routes/Internal/XenBudget/components/ItemForm.tsx",
  "routes/Internal/XenKitchen/components/ItemCard.tsx",
  "routes/Internal/XenKitchen/components/ItemView.tsx",
  "routes/Internal/Xensplit/components/ExpenseForm.tsx",
  "routes/Internal/Xensplit/GroupDetail.tsx",
  "routes/Internal/Xensplit/GroupsList.tsx",
  "routes/Admin/BlogPostForm/components/AssetManager.tsx",
  "components/blog/BlogContent.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("design language: no stray colour literals", () => {
  it("only allow-listed files contain hex / rgb() colours", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).split("\\").join("/");
      if (rel in ALLOWED || ON_IMAGE_OVERLAY.includes(rel)) continue;
      if (COLOUR.test(stripComments(readFileSync(file, "utf8")))) offenders.push(rel);
    }
    expect(offenders, "use theme tokens (see components/ui/DESIGN.md) or allow-list with a reason").toEqual([]);
  });
});
