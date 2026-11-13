// Metric <-> US conversion for ingredient amounts and oven temperatures, for display only: the stored recipe is never
// changed. Pure helpers, shared by the page and its tests. Amounts that aren't a plain number ("a pinch", "to taste")
// and units that aren't a measure of weight or volume (cloves, cans, slices) are left exactly as written.
import { formatAmount, parseAmount } from "./kitchen";

/** How to show a recipe: as written, or converted so every measure is metric or US. */
export type UnitSystem = "original" | "metric" | "us";
export const UNIT_SYSTEMS: UnitSystem[] = ["original", "metric", "us"];
export const UNIT_SYSTEM_LABELS: Record<UnitSystem, string> = { original: "As written", metric: "Metric", us: "US" };

type Kind = "volume" | "weight";
interface UnitInfo {
  kind: Kind;
  system: "metric" | "us";
  /** Size of one of the unit in the base unit: millilitres for volume, grams for weight. */
  size: number;
  /** What to print for it. */
  label: string;
}

const UNITS: Record<string, UnitInfo> = {};
const def = (names: string[], info: UnitInfo) => names.forEach((n) => (UNITS[n] = info));

def(["tsp", "teaspoon", "teaspoons", "tsps"], { kind: "volume", system: "us", size: 4.92892, label: "tsp" });
def(["tbsp", "tbs", "tablespoon", "tablespoons", "tbsps"], {
  kind: "volume",
  system: "us",
  size: 14.7868,
  label: "tbsp",
});
def(["fl oz", "fl. oz", "floz", "fluid ounce", "fluid ounces"], {
  kind: "volume",
  system: "us",
  size: 29.5735,
  label: "fl oz",
});
def(["cup", "cups"], { kind: "volume", system: "us", size: 236.588, label: "cup" });
def(["pint", "pints", "pt"], { kind: "volume", system: "us", size: 473.176, label: "pint" });
def(["quart", "quarts", "qt"], { kind: "volume", system: "us", size: 946.353, label: "quart" });
def(["ml", "milliliter", "milliliters", "millilitre", "millilitres"], {
  kind: "volume",
  system: "metric",
  size: 1,
  label: "ml",
});
def(["l", "liter", "liters", "litre", "litres"], { kind: "volume", system: "metric", size: 1000, label: "L" });
def(["oz", "ounce", "ounces"], { kind: "weight", system: "us", size: 28.3495, label: "oz" });
def(["lb", "lbs", "pound", "pounds"], { kind: "weight", system: "us", size: 453.592, label: "lb" });
def(["g", "gram", "grams"], { kind: "weight", system: "metric", size: 1, label: "g" });
def(["kg", "kilogram", "kilograms"], { kind: "weight", system: "metric", size: 1000, label: "kg" });

const unitInfo = (unit: string): UnitInfo | null => {
  const key = (unit || "").trim().toLowerCase().replace(/\s+/g, " ");
  return UNITS[key] ?? UNITS[key.replace(/\.$/, "")] ?? null;
};

/** Round to a figure a cook would measure: finer for small amounts, coarser for large ones. */
function roundMeasure(n: number): number {
  const step = n < 10 ? 0.5 : n < 20 ? 1 : n < 200 ? 5 : 10;
  return Math.max(step, Math.round(n / step) * step);
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** Snap to the nearest eighth (a measuring spoon or cup mark), keeping tiny amounts as decimals. */
const snapEighth = (n: number) => {
  const snapped = Math.round(n * 8) / 8;
  return snapped > 0 ? snapped : n;
};

/** The metric unit and figure for an amount in millilitres or grams. */
function toMetric(kind: Kind, base: number): { amount: string; label: string } {
  if (kind === "volume") {
    return base >= 1000
      ? { amount: trim(Math.round(base / 10) / 100), label: "L" }
      : { amount: trim(roundMeasure(base)), label: "ml" };
  }
  return base >= 1000
    ? { amount: trim(Math.round(base / 10) / 100), label: "kg" }
    : { amount: trim(roundMeasure(base)), label: "g" };
}

/** The US unit and figure for an amount in millilitres or grams. */
function toUs(kind: Kind, base: number): { amount: string; label: string } {
  if (kind === "weight") {
    const oz = base / UNITS.oz.size;
    return oz >= 16
      ? { amount: formatAmount(snapEighth(oz / 16)), label: "lb" }
      : { amount: formatAmount(snapEighth(oz)), label: "oz" };
  }
  if (base < 15) return { amount: formatAmount(snapEighth(base / UNITS.tsp.size)), label: "tsp" };
  if (base < 60) return { amount: formatAmount(snapEighth(base / UNITS.tbsp.size)), label: "tbsp" };
  return { amount: formatAmount(snapEighth(base / UNITS.cup.size)), label: "cup" };
}

/** A "cup" or "lb" is singular only for exactly one. */
const plural = (label: string, amount: string) =>
  amount === "1" || label === "tsp" || label === "tbsp" || label === "oz" || label === "fl oz"
    ? label
    : pluralize(label);
const pluralize = (label: string) => (label === "cup" || label === "pint" || label === "quart" ? `${label}s` : label);

export interface ConvertedAmount {
  quantity: string;
  unit: string;
}

/**
 * Express an ingredient's amount in the chosen system. `quantity` may be a number, fraction, or range ("2–3"). Anything
 * that can't be converted comes back unchanged.
 */
export function convertAmount(quantity: string, unit: string, system: UnitSystem): ConvertedAmount {
  const same = { quantity, unit };
  const info = unitInfo(unit);
  if (system === "original" || !info || info.system === system) return same;

  const q = (quantity || "").trim();
  const range = /^(.+?)\s*[-–]\s*(.+)$/.exec(q);
  const lo = range ? parseAmount(range[1]) : parseAmount(q);
  const hi = range ? parseAmount(range[2]) : lo;
  if (lo === null || hi === null || lo <= 0) return same;

  const convert = system === "metric" ? toMetric : toUs;
  // The larger end decides the unit, so "1–2 cups" stays in one unit.
  const top = convert(info.kind, Math.max(lo, hi) * info.size);
  if (!range) return { quantity: top.amount, unit: plural(top.label, top.amount) };

  const target = UNITS[top.label.toLowerCase()] ?? UNITS[top.label];
  const inTarget = (n: number) =>
    system === "metric" ? roundMeasure((n * info.size) / target.size) : snapEighth((n * info.size) / target.size);
  const fmt = (n: number) => (system === "metric" ? trim(n) : formatAmount(n));
  return { quantity: `${fmt(inTarget(lo))}–${fmt(inTarget(hi))}`, unit: plural(top.label, top.amount) };
}

/** An oven or pan temperature in the chosen system, to the nearest 5 degrees. "original" keeps what was written. */
export function convertTemp(temp: number, unit: "F" | "C", system: UnitSystem): { temp: number; unit: "F" | "C" } {
  const want = system === "metric" ? "C" : system === "us" ? "F" : unit;
  if (want === unit) return { temp, unit };
  const converted = unit === "F" ? ((temp - 32) * 5) / 9 : (temp * 9) / 5 + 32;
  return { temp: Math.round(converted / 5) * 5, unit: want };
}
