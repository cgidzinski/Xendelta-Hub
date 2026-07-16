/**
 * Pure Plinko odds math, split out of plinko.ts so it's directly unit-testable (same
 * split prizeWeights.ts gives Kitty Scratch/Crossword). See plinko.ts's file header for
 * the full explanation of why slot odds fall out of the binomial distribution for free,
 * and the derivation of the solved edge multiplier below.
 */
export const ROWS = 12;
export const SLOT_COUNT = ROWS + 1;

// Index = landing slot (0..12). Symmetric; see plinko.ts's file header for the
// edge-multiplier derivation.
export const MULTIPLIERS = [18.6, 2, 1.5, 1.3, 1.0, 1, 0.5, 1, 1.0, 1.3, 1.5, 2, 18.6];

export function binomialCoeff(n: number, k: number): number {
    let result = 1;
    for (let i = 0; i < k; i++) {
        result = (result * (n - i)) / (i + 1);
    }
    return result;
}

export const SLOT_WEIGHT = Array.from({ length: SLOT_COUNT }, (_, k) => binomialCoeff(ROWS, k));
export const TOTAL_WEIGHT = Math.pow(2, ROWS); // = sum(SLOT_WEIGHT), every path is equally likely

export function slotProbability(slot: number): number {
    return SLOT_WEIGHT[slot] / TOTAL_WEIGHT;
}

export function plinkoRtp(): number {
    return SLOT_WEIGHT.reduce((sum, weight, slot) => sum + weight * MULTIPLIERS[slot], 0) / TOTAL_WEIGHT;
}
