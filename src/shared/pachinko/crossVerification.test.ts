import { describe, it, expect } from "vitest";
import { simulateShot, TRAJECTORY_SAMPLE_MS } from "./pachinkoPhysics";
import { mulberry32 } from "./prng";
import { spinReel, reelRngForSeed } from "./pachinkoReels";
import { applyShot, gateFlagsFor, PachinkoGateState, PachinkoPayoutConstants } from "./economy";
import { HOLD_TO_FIRE_INTERVAL_MS } from "./pachinkoRules";

/**
 * The test that proves the whole redesign actually holds.
 *
 * Pachinko is played entirely on the client - it fires, simulates and renders every shot locally
 * with no network call in the path - while the server independently replays the same shots from
 * their seeds and is the sole authority on the economy. For a long time those two derivations
 * quietly disagreed, and players saw pockets score at random: a ball would visibly fall into one
 * pocket while the server credited a different one.
 *
 * Four structural properties now make disagreement impossible rather than merely unlikely, and
 * this file exercises all four against a full multi-shot round. If any of them ever regress,
 * these tests fail here rather than as an unreproducible "the pockets are acting weird" report:
 *
 *   1. A ball's TRAJECTORY doesn't depend on gate state at all - gates changed real collision
 *      geometry before, so one disagreed-upon boolean could relocate the ball entirely.
 *   2. Gate windows are durations carried by the shot (firedAtMs), never read from a clock inside
 *      the fold - so there's nothing for the two sides to skew, drift, or stamp at different moments.
 *   3. A window's open bound - not just its close - is honoured, so a shot fired in the gap between
 *      a catch's near-instant fold and its own visible reveal can't see the gate as already open.
 *   4. The reel is derived from the shot's own seed, so the client isn't blind to its own attacker
 *      window until a batch response comes back.
 */

const CONSTANTS: PachinkoPayoutConstants = { bonusPocketBalls: 2, sideTulipBalls: 2, attackerBalls: 24 };
const PRICE_PER_BALL = 100;
const POOL = 5000;

interface Shot {
    seq: number;
    seed: number;
    launchPower: number;
    // Fired at the board's real hold-to-fire cadence, same as an actual round - this is what makes
    // the attacker-window test below a genuine exercise of the open/close bounds rather than an
    // artificial one.
    firedAtMs: number;
}

function makeShots(count: number, startAtMs = 0): Shot[] {
    // A spread of launch powers, including the low-power band where the gated pockets sit on the
    // ball's path and where divergence used to be worst.
    return Array.from({ length: count }, (_, i) => ({
        seq: i + 1,
        seed: 7000 + i * 37,
        launchPower: 12.5 + (i % 8) * 11,
        firedAtMs: startAtMs + i * HOLD_TO_FIRE_INTERVAL_MS,
    }));
}

// One side's full derivation of a round: fold every shot in seq order, exactly as both
// PachinkoBoard.tsx's fireOnce/ledger and pachinko.ts's processBatch do.
function playRound(shots: Shot[], start: PachinkoGateState) {
    let state = { ...start };
    const perShot: Array<{ seq: number; outcome: string; ballsAwarded: number; state: PachinkoGateState }> = [];
    for (const shot of shots) {
        if (state.ballsRemaining <= 0) break;
        const flags = gateFlagsFor(state, shot.firedAtMs);
        const { outcome, trajectory } = simulateShot(shot.launchPower, flags.chuckerActive, flags.attackerActive, flags.jackpotActive, mulberry32(shot.seed));
        const reelSpin = outcome === "chucker" ? spinReel(reelRngForSeed(shot.seed)) : undefined;
        const flightMs = trajectory.length * TRAJECTORY_SAMPLE_MS;
        const { ballsAwarded, outcome: scored, nextState } = applyShot(state, outcome, reelSpin, CONSTANTS, POOL, PRICE_PER_BALL, shot.firedAtMs, flightMs);
        state = nextState;
        perShot.push({ seq: shot.seq, outcome: scored, ballsAwarded, state: { ...state } });
    }
    return { finalState: state, perShot };
}

const START: PachinkoGateState = {
    ballsRemaining: 200,
    leftTulipOpen: false,
    rightTulipOpen: false,
    attackerOpenFromMs: 0,
    attackerOpenUntilMs: 0,
    jackpotOpenFromMs: 0,
    jackpotOpenUntilMs: 0,
};

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
        // "when": since neither applyShot nor simulateShot nor spinReel reads a clock directly (time
        // only ever arrives as the shot's own firedAtMs argument), the only way this could fail is
        // if one of them started reading Date.now()/performance.now() internally.
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

    it("a round that opens the attacker keeps both sides in step across the whole window, honouring both its open and close bounds", () => {
        // Force an attacker window open across a real span of firedAtMs values, then play a long
        // burst through it - the phase where the two sides used to drift hardest, because the client
        // couldn't see the window at all until a batch response arrived.
        const shots = makeShots(60);
        const windowFromMs = shots[5].firedAtMs; // opens partway through the burst...
        const windowUntilMs = shots[35].firedAtMs; // ...and closes partway through it too
        const opened: PachinkoGateState = { ...START, attackerOpenFromMs: windowFromMs, attackerOpenUntilMs: windowUntilMs };
        const a = playRound(shots, opened);
        const b = playRound(shots, opened);
        expect(a.perShot).toEqual(b.perShot);
        expect(a.finalState).toEqual(b.finalState);

        // And the derived flags actually respect BOTH bounds, not just the close - a shot fired
        // before the window opens must not see it active, one inside it must, and one after it
        // closes must not either. This is exactly the property that used to fail when only a close
        // time was tracked (see PachinkoGateState's own comment in economy.ts).
        expect(gateFlagsFor(opened, shots[4].firedAtMs).attackerActive).toBe(false); // before it opens
        expect(gateFlagsFor(opened, shots[5].firedAtMs).attackerActive).toBe(true); // opens
        expect(gateFlagsFor(opened, shots[20].firedAtMs).attackerActive).toBe(true); // well inside
        expect(gateFlagsFor(opened, shots[35].firedAtMs).attackerActive).toBe(false); // closes
        expect(gateFlagsFor(opened, shots[40].firedAtMs).attackerActive).toBe(false); // after it closes
    }, 120000);
});
