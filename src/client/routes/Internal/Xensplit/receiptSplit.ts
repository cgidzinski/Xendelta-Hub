import { roundMoney } from "@shared/money";

export interface ReceiptLine {
  name: string;
  amount: number;
}

/** Whole cents, so shares can be handed out without a stray cent appearing or vanishing. */
const toCents = (amount: number) => Math.round(roundMoney(amount) * 100);
const fromCents = (cents: number) => roundMoney(cents / 100);

/**
 * Hands `cents` out in proportion to `weights` so the parts add up to exactly `cents`: everyone gets their floor and
 * the leftover cents go, one each, to the largest remainders (ties to the earlier entry).
 */
function allocate(cents: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (total <= 0)
    return allocate(
      cents,
      weights.map(() => 1),
    );
  const exact = weights.map((w) => (cents * w) / total);
  const parts = exact.map(Math.floor);
  let left = cents - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

/**
 * What each person owes for a receipt. Every line is shared equally by the people it is assigned to; tax and tip are
 * then spread in proportion to what each person's lines came to. Lines nobody is assigned to are left out, and the
 * result always adds up to the assigned lines plus tax and tip, to the cent. Returns amounts in dollars by person.
 */
export function splitReceipt(
  lines: ReceiptLine[],
  assignments: string[][],
  tax: number,
  tip: number,
): Record<string, number> {
  const subtotals = new Map<string, number>();
  lines.forEach((line, index) => {
    const people = [...new Set(assignments[index] ?? [])];
    if (people.length === 0) return;
    allocate(
      toCents(line.amount),
      people.map(() => 1),
    ).forEach((share, i) => subtotals.set(people[i], (subtotals.get(people[i]) ?? 0) + share));
  });

  const ids = [...subtotals.keys()];
  if (ids.length === 0) return {};
  const weights = ids.map((id) => subtotals.get(id) ?? 0);
  const taxShares = allocate(toCents(tax), weights);
  const tipShares = allocate(toCents(tip), weights);
  const owed: Record<string, number> = {};
  ids.forEach((id, i) => {
    owed[id] = fromCents(weights[i] + taxShares[i] + tipShares[i]);
  });
  return owed;
}
