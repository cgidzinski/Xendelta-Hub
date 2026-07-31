/**
 * The board's central digital reel gimmick - triggered by a chucker catch, mirroring how a real
 * modern machine's "heso" (start chucker) fires its own LCD reel spin, which is what modern
 * boards actually put in the middle of the field. Uses the Slots engine's own
 * ITEM_A/ITEM_B/.../JACKPOT_ITEM symbol-key vocabulary (slots.ts), so XenCasino has one
 * consistent reel-symbol language instead of a second one invented just for this board - the
 * frontend still owns 100% of what each key actually looks like, same as every slots machine.
 *
 * ## Why this is seeded and shared, not server-only
 *
 * This module used to live server-side and draw from Node's `crypto.randomInt`, which meant the
 * client could not know a chucker catch's result without a network round trip. Two things went
 * wrong because of that, and both were unfixable while the dependency existed:
 *
 *   - The reel had to start spinning on a placeholder and wait for the server, so any hiccup in
 *     matching a response back to its spin left the reel visibly spinning forever.
 *   - Far worse: a three-of-a-kind opens the attacker gate, so until the response arrived the
 *     client did not know the attacker had opened - and every ball fired in that gap was
 *     simulated against a board the server disagreed with.
 *
 * Deriving the reel from the shot's own seed - exactly as the physics already is (see
 * pachinkoPhysics.ts) - removes both. The client knows the result the instant the shot resolves,
 * and the server re-derives the identical result from the identical seed when it replays the
 * batch. `drawWeighted` here is a seeded twin of the server's crypto-backed
 * `src/server/utils/weightedDraw.ts`; at these weights the two are behaviourally equivalent, and
 * nothing about a reel spin needs cryptographic randomness - it needs REPRODUCIBILITY, which the
 * crypto version cannot provide by definition.
 *
 * Note the reel deliberately runs on its OWN rng stream, derived from the shot's seed but
 * separate from the physics stream (see reelRngForSeed). simulateShot runs on a worker thread and
 * returns no rng state, and sharing one stream would couple the reel's symbols to however many
 * draws the physics happened to consume - which would make the reel result depend on board
 * geometry, quietly reintroducing exactly the kind of hidden coupling this redesign removes.
 *
 * Unlike slots.ts, this isn't its own wagered game with an RTP to solve - it's a small bonus
 * layered onto the chucker's existing, already-simulated-physics economy (see pachinkoPayouts.ts's
 * own header on why this board doesn't do closed-form RTP), so the weights and bonus sizes are
 * deliberately modest starting values, not solved for a target return.
 */
import { Rng, mulberry32 } from "./prng";
import { ATTACKER_OPEN_SHOTS, REEL_TWO_MATCH_BALLS, REEL_THREE_MATCH_BALLS } from "./pachinkoRules";

export type ReelSymbol = string;
export type ReelMatchTier = "none" | "two" | "three";

export interface ReelSpinResult {
    symbols: [ReelSymbol, ReelSymbol, ReelSymbol];
    matchTier: ReelMatchTier;
    ballsAwarded: number;
    // Only a three-of-a-kind match opens the attacker (ATTACKER_OPEN_SHOTS); two-of-a-kind and
    // misses award zero attacker balls. pachinko.ts's chucker branch ADDS this to whatever's
    // currently left on the attacker's counter rather than resetting it.
    attackerOpenShots: number;
}

interface WeightedOption<T> {
    value: T;
    weight: number;
}

const REEL_SYMBOL_WEIGHTS: WeightedOption<ReelSymbol>[] = [
    { value: "ITEM_A", weight: 40 },
    { value: "ITEM_B", weight: 28 },
    { value: "ITEM_C", weight: 18 },
    { value: "ITEM_D", weight: 10 },
    { value: "JACKPOT_ITEM", weight: 4 },
];

// Seeded twin of src/server/utils/weightedDraw.ts's crypto-backed drawWeighted - same cumulative
// scan, with `Math.floor(rng() * total)` standing in for `crypto.randomInt(0, total)`. Behaviourally
// equivalent at these weights: mulberry32 emits 2^32 distinct values, so bucketing into a total of
// 100 carries no meaningful modulo bias.
function drawWeighted<T>(options: WeightedOption<T>[], rng: Rng): T {
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    const roll = Math.floor(rng() * total);
    let cumulative = 0;
    for (const { value, weight } of options) {
        cumulative += weight;
        if (roll < cumulative) {
            return value;
        }
    }
    return options[options.length - 1].value;
}

// The reel's own rng stream for a given shot seed - deliberately NOT the same stream the physics
// runs on, see this file's own header for why. The XOR constant is arbitrary; it exists only to
// decorrelate the two streams derived from one seed.
export function reelRngForSeed(seed: number): Rng {
    return mulberry32((seed ^ 0x5ee1d5ee) >>> 0);
}

// Any two matching (regardless of which symbol) is "two" - simpler than slots.ts's own
// MINOR_ITEM-specific two-of-a-kind rule, since this reel doesn't need a full paytable per
// symbol, just three tiers to feed into the chucker's own ball economy.
export function reelMatchTier(symbols: [ReelSymbol, ReelSymbol, ReelSymbol]): ReelMatchTier {
    const [a, b, c] = symbols;
    if (a === b && b === c) return "three";
    if (a === b || b === c || a === c) return "two";
    return "none";
}

// `rng` defaults to Math.random for callers that don't need to reproduce a specific spin (the RTP
// tuning script, the payout tests). Every real gameplay caller - the client's own local mirror and
// the server's batch replay - passes reelRngForSeed(shot.seed), which is what makes both sides
// derive the identical spin for the identical shot.
export function spinReel(rng: Rng = Math.random): ReelSpinResult {
    const symbols: [ReelSymbol, ReelSymbol, ReelSymbol] = [drawWeighted(REEL_SYMBOL_WEIGHTS, rng), drawWeighted(REEL_SYMBOL_WEIGHTS, rng), drawWeighted(REEL_SYMBOL_WEIGHTS, rng)];
    const matchTier = reelMatchTier(symbols);
    return {
        symbols,
        matchTier,
        ballsAwarded: matchTier === "three" ? REEL_THREE_MATCH_BALLS : matchTier === "two" ? REEL_TWO_MATCH_BALLS : 0,
        attackerOpenShots: matchTier === "three" ? ATTACKER_OPEN_SHOTS : 0,
    };
}
