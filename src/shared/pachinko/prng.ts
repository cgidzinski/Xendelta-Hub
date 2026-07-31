/**
 * A tiny seeded PRNG (mulberry32) - the one piece of infrastructure the client-side/server-side
 * split physics needs that plain `Math.random()` can't provide: the exact same sequence of
 * "random" draws from the exact same seed, on both sides.
 *
 * Not cryptographically secure and not meant to be - it only needs to be *reproducible*, not
 * unguessable. Unpredictability comes from the seed being server-issued (see pachinko.ts's
 * ticket flow), not from the generator itself. The client never gets to choose its own seed.
 */
export type Rng = () => number; // uniform in [0, 1), same contract as Math.random()

export function mulberry32(seed: number): Rng {
    let state = seed >>> 0;
    return function rng(): number {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 32-bit unsigned seed - large enough space that seeds are effectively never reused, small
// enough to round-trip cleanly through JSON as a plain number (no BigInt).
export function randomSeed(): number {
    return Math.floor(Math.random() * 4294967296);
}
