/**
 * The shared primitive behind "a scratch field with one already-decided prize at the end" -
 * a ticket (or, for Crossword, a word-count tier) is just a price plus a flat weighted table
 * of possible prize values. No combinatorics needed (unlike a symbol-matching engine) - the
 * prize is drawn directly, so RTP is a plain weighted average.
 */
const crypto = require("crypto");

export interface PrizeWeight {
    value: number;
    weight: number;
}

function totalWeight(weights: PrizeWeight[]): number {
    return weights.reduce((sum, w) => sum + w.weight, 0);
}

// Generic over the weight object itself - lets a caller with a richer tier shape (e.g.
// Crossword's { count, value, weight }) get the whole matched tier back, not just its value.
export function drawPrizeWeight<T extends { weight: number }>(weights: T[]): T {
    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    const roll = crypto.randomInt(0, total);
    let cumulative = 0;
    for (const w of weights) {
        cumulative += w.weight;
        if (roll < cumulative) {
            return w;
        }
    }
    return weights[weights.length - 1];
}

export function drawPrize(weights: PrizeWeight[]): number {
    return drawPrizeWeight(weights).value;
}

export function prizeRtp(price: number, weights: PrizeWeight[]): number {
    const total = totalWeight(weights);
    const expectedValue = weights.reduce((sum, w) => sum + w.value * w.weight, 0) / total;
    return expectedValue / price;
}

export function prizeDistribution(weights: PrizeWeight[]): { value: number; probability: number }[] {
    const total = totalWeight(weights);
    return weights.map((w) => ({ value: w.value, probability: w.weight / total }));
}
