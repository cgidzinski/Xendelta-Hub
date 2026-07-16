/**
 * Pure Pachinko odds math, split out of pachinko.ts so it's directly unit-testable (same
 * split plinkoOdds.ts gives Plinko, prizeWeights.ts gives Kitty Scratch/Crossword). Unlike
 * Plinko, pocket odds here are hand-weighted, not derived from a fair-coin walk - real
 * pachinko boards are mostly "miss," which a binomial distribution over a small number of
 * pockets can't produce on its own.
 *
 * RTP is split into two parts, same layering slots.ts uses for its jackpot pool:
 *   - FIXED_RTP: the two fixed-multiplier pocket pairs (jackpot 25x, small 1.5x) alone
 *   - CONTRIBUTION_RATE: the "start" pocket doesn't pay a fixed amount - it pays whatever is
 *     in the jackpot pool, which every non-start ball feeds by CONTRIBUTION_RATE * wager.
 *     Every dollar contributed is eventually paid back out to whoever hits "start," so (per
 *     slots.ts's own reasoning) the pool's long-run RTP contribution is just its own
 *     contribution rate, independent of how rare "start" actually is.
 * FIXED_RTP + CONTRIBUTION_RATE is solved to land on the same 95% target Plinko uses:
 *   FIXED_RTP = 2*0.002*25 + 2*0.038*1.5 = 0.1 + 0.114 = 0.214
 *   CONTRIBUTION_RATE = 0.95 - 0.214 = 0.736
 */
import crypto = require("crypto");
import { POCKETS, PocketConfig, PocketType } from "./pachinkoLayout";

// Weights out of TOTAL_WEIGHT, index-aligned with POCKETS. Index: 0/10 jackpot, 3/7 small,
// 5 start, everything else (6 pockets) miss - see pachinkoLayout.ts for the pocket ordering.
export const POCKET_WEIGHT: number[] = [20, 1510, 1510, 380, 1510, 140, 1510, 380, 1510, 1510, 20];
export const TOTAL_WEIGHT = POCKET_WEIGHT.reduce((a, b) => a + b, 0); // 10000 - 0.01% resolution

export const TARGET_RTP = 0.95;
export const FIXED_RTP = POCKETS.reduce((sum, pocket, i) => sum + (POCKET_WEIGHT[i] / TOTAL_WEIGHT) * (pocket.type === "jackpot" || pocket.type === "small" ? (pocket.multiplier ?? 0) : 0), 0);
export const CONTRIBUTION_RATE = TARGET_RTP - FIXED_RTP;
export const JACKPOT_SEED = 0;

export function pocketProbability(index: number): number {
    return POCKET_WEIGHT[index] / TOTAL_WEIGHT;
}

export function missProbability(): number {
    return POCKETS.reduce((sum, pocket, i) => sum + (pocket.type === "miss" ? POCKET_WEIGHT[i] / TOTAL_WEIGHT : 0), 0);
}

// Weighted draw over pockets, same crypto.randomInt-over-cumulative-weight shape as Slots'
// drawSymbol - the outcome is decided here, before anything is simulated or persisted.
export function pickTargetPocket(): PocketConfig {
    const roll = crypto.randomInt(0, TOTAL_WEIGHT);
    let cumulative = 0;
    for (let i = 0; i < POCKETS.length; i++) {
        cumulative += POCKET_WEIGHT[i];
        if (roll < cumulative) {
            return POCKETS[i];
        }
    }
    return POCKETS[POCKETS.length - 1];
}

// Fixed-amount payout for a pocket ("small"/"jackpot"); "start" is paid from the live
// jackpot pool (route has to read that from the DB, so it's handled there) and "miss" pays
// nothing.
export function fixedPocketPayout(pocket: PocketConfig, pricePerBall: number): number {
    if (pocket.type === "small" || pocket.type === "jackpot") {
        return pricePerBall * (pocket.multiplier ?? 0);
    }
    return 0;
}

export interface PaytableRow {
    index: number;
    type: PocketType;
    probability: number;
    multiplier?: number; // absent for "start" (pays the pool) and "miss" (pays nothing)
}

export function paytable(): PaytableRow[] {
    return POCKETS.map((pocket, i) => ({
        index: pocket.index,
        type: pocket.type,
        probability: pocketProbability(i),
        multiplier: pocket.type === "small" || pocket.type === "jackpot" ? pocket.multiplier : undefined,
    }));
}
