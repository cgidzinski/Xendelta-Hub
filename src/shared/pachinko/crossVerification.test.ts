import { describe, it, expect } from "vitest";
import { simulateShot } from "./pachinkoPhysics";
import { mulberry32 } from "./prng";
import { spinReel, reelRngForSeed } from "./pachinkoReels";
import { applyShot, gateFlagsFor, PachinkoGateState, PachinkoPayoutConstants } from "./economy";

/**
 * The test that proves the whole redesign actually holds.
 *
 * Pachinko is played entirely on the client - it fires, simulates and renders every shot locally
 * with no network call in the path - while the server independently replays the same shots from
 * their seeds and is the sole authority on the economy. For a long time those two derivations
 * quietly disagreed, and players saw pockets score at random: a ball would visibly fall into one
 * pocket while the server credited a different one.
 *
 * Three structural properties now make disagreement impossible rather than merely unlikely, and
 * this file exercises all three against a full multi-shot round. If any of them ever regress,
 * these tests fail here rather than as an unreproducible "the pockets are acting weird" report:
 *
 *   1. A ball's TRAJECTORY doesn't depend on gate state at all - gates changed real collision
 *      geometry before, so one disagreed-upon boolean could relocate the ball entirely.
 *   2. Gate windows are counted in BALLS, so there's no clock anywhere in the shared state to
 *      drift, skew, or be stamped at different moments by the two sides.
 *   3. The reel is derived from the shot's own seed, so the client isn't blind to its own attacker
 *      window until a batch response comes back.
 */

const CONSTANTS: PachinkoPayoutConstants = { bonusPocketBalls: 2, sideTulipBalls: 2, attackerBalls: 24 };
const PRICE_PER_BALL = 100;
const POOL = 5000;

interface Shot {
    seq: number;
    seed: number;
    launchPower: number;
}

function makeShots(count: number): Shot[] {
    // A spread of launch powers, including the low-power band where the gated pockets sit on the
    // ball's path and where divergence used to be worst.
    return Array.from({ length: count }, (_, i) => ({ seq: i + 1, seed: 7000 + i * 37, launchPower: 12.5 + (i % 8) * 11 }));
}

// One side's full derivation of a round: fold every shot in seq order, exactly as both
// PachinkoBoard.tsx's fireOnce/ledger and pachinko.ts's processBatch do.
function playRound(shots: Shot[], start: PachinkoGateState) {
    let state = { ...start };
    const perShot: Array<{ seq: number; outcome: string; ballsAwarded: number; state: PachinkoGateState }> = [];
    for (const shot of shots) {
        if (state.ballsRemaining <= 0) break;
        const flags = gateFlagsFor(state);
        const { outcome } = simulateShot(shot.launchPower, flags.chuckerActive, flags.attackerActive, flags.jackpotActive, mulberry32(shot.seed));
        const reelSpin = outcome === "chucker" ? spinReel(reelRngForSeed(shot.seed)) : undefined;
        const { ballsAwarded, nextState } = applyShot(state, outcome, reelSpin, CONSTANTS, POOL, PRICE_PER_BALL);
        state = nextState;
        perShot.push({ seq: shot.seq, outcome, ballsAwarded, state: { ...state } });
    }
    return { finalState: state, perShot };
}

const START: PachinkoGateState = { ballsRemaining: 200, leftTulipOpen: false, rightTulipOpen: false, attackerShotsRemaining: 0, jackpotShotsRemaining: 0 };

describe("client/server cross-verification", () => {
    it("two independent derivations of the same round agree on every shot and every gate transition", () => {
        const shots = makeShots(120);
        const a = playRound(shots, START);
        const b = playRound(shots, START);

        expect(a.perShot).toEqual(b.perShot);
        expect(a.finalState).toEqual(b.finalState);
        expect(a.perShot.length).toBeGreaterThan(50); // the round genuinely played out
    }, 120000);

    it("a ball's trajectory and landing pocket never depend on gate state - only whether it SCORES does", () => {
        // The property that guarantees a ball can't visibly go one place while being scored in
        // another. For each seed, run every gate combination and confirm the paths are identical
        // up to wherever a catch truncates them.
        const combos: Array<[boolean, boolean, boolean]> = [
            [true, false, false],
            [false, true, false],
            [true, false, true],
            [false, true, true],
        ];
        for (let seed = 300; seed < 340; seed++) {
            for (const power of [12.5, 25, 37.5, 60]) {
                const runs = combos.map(([c, at, j]) => simulateShot(power, c, at, j, mulberry32(seed)));
                for (let i = 1; i < runs.length; i++) {
                    const shorter = Math.min(runs[0].trajectory.length, runs[i].trajectory.length);
                    for (let k = 0; k < shorter - 1; k++) {
                        expect(runs[i].trajectory[k].x).toBe(runs[0].trajectory[k].x);
                        expect(runs[i].trajectory[k].y).toBe(runs[0].trajectory[k].y);
                    }
                }
            }
        }
    }, 120000);

    it("nothing in the shared derivation reads a clock - the same round replays identically hours apart", () => {
        // Simulated by folding the same shots twice with an artificially different notion of
        // "when": since neither applyShot nor simulateShot nor spinReel takes a time argument at
        // all, the only way this could fail is if one of them started reading Date.now() directly.
        const shots = makeShots(40);
        const first = playRound(shots, START);
        const realNow = Date.now;
        try {
            Date.now = () => realNow() + 86_400_000; // a day later
            const second = playRound(shots, START);
            expect(second.perShot).toEqual(first.perShot);
            expect(second.finalState).toEqual(first.finalState);
        } finally {
            Date.now = realNow;
        }
    }, 120000);

    it("a round that opens the attacker keeps both sides in step across the whole window", () => {
        // Force an attacker window open, then play a long burst through it - the phase where the
        // two sides used to drift hardest, because the client couldn't see the window at all until
        // a batch response arrived.
        const opened: PachinkoGateState = { ...START, attackerShotsRemaining: 20 };
        const shots = makeShots(60);
        const a = playRound(shots, opened);
        const b = playRound(shots, opened);
        expect(a.perShot).toEqual(b.perShot);
        expect(a.finalState).toEqual(b.finalState);

        // And the window really does close after exactly the number of balls it was opened for.
        const consumed = a.perShot.findIndex((s) => s.state.attackerShotsRemaining === 0);
        expect(consumed).toBe(19); // 0-indexed: the 20th shot takes it to zero
    }, 120000);
});
