/**
 * Generate the shared paint catalogue that Recipaint's add-paint dialog searches.
 *
 * Run: npx tsx scripts/build-paint-catalogue.ts [Brand ...]
 *
 * Reads the `miniature-paints` package (a devDependency) and writes
 * src/server/data/paintCatalogue.json. The catalogue is static reference data, so it lives in
 * the repo rather than in Mongo: nothing to seed, nothing to keep in sync, and no drift
 * between the database and the source.
 *
 * Output is sorted by key so re-running with an unchanged dataset produces a byte-identical
 * file - otherwise every run would churn the diff.
 *
 * Data: miniature-paints (MIT), scraped and released by the Miniature Painter Pro team.
 * https://github.com/Arcturus5404/miniature-paints
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { ArmyPainter, CitadelColour, PaintColor, Scale75, Vallejo } from "miniature-paints";
import { catalogueKey, paintTypeFromDataset } from "../src/shared/recipaint/paints";

/** The miniature-painting brands. The dataset also carries craft and industrial ranges
 *  (Pantone, RAL, Liquitex) that would only dilute search results here. */
const BRANDS: Record<string, PaintColor[]> = {
  "Citadel Colour": CitadelColour,
  Vallejo,
  "Army Painter": ArmyPainter,
  Scale75,
};

const OUTPUT = join(__dirname, "..", "src", "server", "data", "paintCatalogue.json");

export interface CataloguePaint {
  key: string;
  brand: string;
  name: string;
  range: string;
  hex: string;
  type: string;
  /** Lowercased "brand range name", so a query is one includes() per row. */
  search: string;
}

function build(selected: string[]): CataloguePaint[] {
  const byKey = new Map<string, CataloguePaint>();
  let skipped = 0;
  let collided = 0;

  for (const brand of selected) {
    const rows = BRANDS[brand];
    if (!rows) {
      throw new Error(`Unknown brand "${brand}". Known: ${Object.keys(BRANDS).join(", ")}`);
    }

    for (const row of rows) {
      const name = (row.name || "").trim();
      const range = (row.set || "").trim();
      if (!name) {
        skipped += 1;
        continue;
      }

      const key = catalogueKey({ brand, range, name });
      if (byKey.has(key)) {
        // A handful of genuine duplicates exist within a single range; first one wins.
        collided += 1;
        continue;
      }

      byKey.set(key, {
        key,
        brand,
        name,
        range,
        hex: (row.hex || "").trim().toUpperCase(),
        type: paintTypeFromDataset(range, row.type),
        search: `${brand} ${range} ${name}`.toLowerCase().replace(/\s+/g, " ").trim(),
      });
    }

    console.log(`  ${brand.padEnd(16)} ${rows.length} rows`);
  }

  if (skipped) console.log(`  skipped ${skipped} rows with no name`);
  if (collided) console.log(`  ${collided} duplicate keys within a range (first kept)`);

  // Stable order, so the committed file only changes when the data does.
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const selected = process.argv.slice(2);
const brands = selected.length > 0 ? selected : Object.keys(BRANDS);

console.log("Building paint catalogue from miniature-paints (MIT)...");
const catalogue = build(brands);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");

console.log(`\nWrote ${catalogue.length} paints to ${OUTPUT}`);
