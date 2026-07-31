import { describe, it, expect } from "vitest";
import { applyShot, gateFlagsFor, PachinkoGateState, PachinkoPayoutConstants } from "./economy";
import { spinReel, reelRngForSeed, ReelSpinResult } from "./pachinkoReels";
import { ATTACKER_OPEN_SHOTS, JACKPOT_OPEN_SHOTS } from "./pachinkoRules";

const CONSTANTS: PachinkoPayoutConstants = { bonusPocketBalls: 2, sideTulipBalls: 2, attackerBalls: 24 };
const PRICE_PER_BALL = 100;

function state(overrides: Partial<PachinkoGateState> = {}): PachinkoGateState {
    return { ballsRemaining: 100, leftTulipOpen: false, rightTulipOpen: false, attackerShotsRemaining: 0, jackpotShotsRemaining: 0, ...overrides };
}

const apply = (s: PachinkoGateState, outcome: Parameters<typeof applyShot>[1], reelSpin?: ReelSpinResult) => applyShot(s, outcome, reelSpin, CONSTANTS, 1000, PRICE_PER_BALL);

describe("gateFlagsFor", () => {
    it("chucker and attacker share one gate - the chucker only scores while the attacker isn't running", () => {
        expect(gateFlagsFor(state())).toEqual({ chuckerActive: true, attackerActive: false, jackpotActive: false });
        expect(gateFlagsFor(state({ attackerShotsRemaining: 3 }))).toEqual({ chuckerActive: false, attackerActive: true, jackpotActive: false });
    });

    it("the jackpot is live exactly while its ball counter is above zero", () => {
        expect(gateFlagsFor(state({ jackpotShotsRemaining: 1 })).jackpotActive).toBe(true);
        expect(gateFlagsFor(state({ jackpotShotsRemaining: 0 })).jackpotActive).toBe(false);
    });
});

describe("applyShot", () => {
    it("is pure - never mutates the state passed in", () => {
        const s = state();
        const snapshot = { ...s };
        apply(s, "bonusLeft");
        expect(s).toEqual(snapshot);
    });

    it("charges exactly one ball for firing, on every outcome including a miss", () => {
        expect(apply(state(), "gutter").nextState.ballsRemaining).toBe(99);
        expect(apply(state(), "bonusLeft").nextState.ballsRemaining).toBe(99 + CONSTANTS.bonusPocketBalls);
        expect(apply(state(), "attacker").nextState.ballsRemaining).toBe(99 + CONSTANTS.attackerBalls);
    });

    it("toggles the matching tulip and pays the tulip award", () => {
        const first = apply(state(), "tulipLeft");
        expect(first.ballsAwarded).toBe(CONSTANTS.sideTulipBalls);
        expect(first.nextState.leftTulipOpen).toBe(true);
        expect(first.nextState.rightTulipOpen).toBe(false);
        // Catching it again closes it back up.
        expect(apply(first.nextState, "tulipLeft").nextState.leftTulipOpen).toBe(false);
    });

    it("opening both tulips primes the jackpot for exactly JACKPOT_OPEN_SHOTS balls", () => {
        const next = apply(state({ leftTulipOpen: true }), "tulipRight").nextState;
        expect(next.jackpotShotsRemaining).toBe(JACKPOT_OPEN_SHOTS);
        expect(gateFlagsFor(next).jackpotActive).toBe(true);
    });

    it("the jackpot window covers exactly the next JACKPOT_OPEN_SHOTS shots, then closes and resets both tulips", () => {
        let s = apply(state({ leftTulipOpen: true }), "tulipRight").nextState;
        for (let i = 0; i < JACKPOT_OPEN_SHOTS; i++) {
            expect(gateFlagsFor(s).jackpotActive).toBe(true);
            s = apply(s, "gutter").nextState;
        }
        expect(gateFlagsFor(s).jackpotActive).toBe(false);
        // Window ran out without being converted - the priming sequence starts over.
        expect(s.leftTulipOpen).toBe(false);
        expect(s.rightTulipOpen).toBe(false);
    });

    it("tulips don't re-toggle while the jackpot window they primed is still running", () => {
        const primed = apply(state({ leftTulipOpen: true }), "tulipRight").nextState;
        const during = apply(primed, "tulipLeft");
        expect(during.ballsAwarded).toBe(CONSTANTS.sideTulipBalls); // still pays
        expect(during.nextState.leftTulipOpen).toBe(true); // but doesn't flip
        expect(during.nextState.jackpotShotsRemaining).toBe(JACKPOT_OPEN_SHOTS - 1); // and doesn't re-prime
    });

    it("catching the jackpot closes its window immediately and resets both tulips", () => {
        const primed = apply(state({ leftTulipOpen: true }), "tulipRight").nextState;
        const hit = apply(primed, "jackpot");
        expect(hit.ballsAwarded).toBe(Math.round(1000 / PRICE_PER_BALL));
        expect(hit.nextState.jackpotShotsRemaining).toBe(0);
        expect(hit.nextState.leftTulipOpen).toBe(false);
        expect(hit.nextState.rightTulipOpen).toBe(false);
    });

    it("a chucker pays only what its reel spin says, and only a three-of-a-kind opens the attacker", () => {
        const noMatch: ReelSpinResult = { symbols: ["ITEM_A", "ITEM_B", "ITEM_C"], matchTier: "none", ballsAwarded: 0, attackerOpenShots: 0 };
        const three: ReelSpinResult = { symbols: ["ITEM_A", "ITEM_A", "ITEM_A"], matchTier: "three", ballsAwarded: 14, attackerOpenShots: ATTACKER_OPEN_SHOTS };

        const miss = apply(state(), "chucker", noMatch);
        expect(miss.ballsAwarded).toBe(0);
        expect(miss.nextState.attackerShotsRemaining).toBe(0);

        const win = apply(state(), "chucker", three);
        expect(win.ballsAwarded).toBe(14);
        expect(win.nextState.attackerShotsRemaining).toBe(ATTACKER_OPEN_SHOTS);
        // The window covers the NEXT shots, not the one that opened it.
        expect(gateFlagsFor(win.nextState).attackerActive).toBe(true);
    });

    it("stacked three-of-a-kinds add to the attacker window rather than resetting it", () => {
        const three: ReelSpinResult = { symbols: ["ITEM_A", "ITEM_A", "ITEM_A"], matchTier: "three", ballsAwarded: 14, attackerOpenShots: ATTACKER_OPEN_SHOTS };
        const once = apply(state(), "chucker", three).nextState;
        const twice = apply(once, "chucker", three).nextState;
        // One ball burned by the second shot, then a second full window added on top.
        expect(twice.attackerShotsRemaining).toBe(ATTACKER_OPEN_SHOTS - 1 + ATTACKER_OPEN_SHOTS);
    });

    it("never lets a window counter go negative", () => {
        let s = state({ attackerShotsRemaining: 1 });
        s = apply(s, "gutter").nextState;
        expect(s.attackerShotsRemaining).toBe(0);
        s = apply(s, "gutter").nextState;
        expect(s.attackerShotsRemaining).toBe(0);
    });

    it("a jackpot catch awards 0 rather than dividing by zero when pricePerBall is 0", () => {
        expect(applyShot(state(), "jackpot", undefined, CONSTANTS, 1000, 0).ballsAwarded).toBe(0);
    });

    // Regression test for a real, shipped bug. One API response briefly sent the OLD field names
    // (attackerOpenUntil instead of attackerShotsRemaining), so the counters arrived `undefined`.
    // That didn't merely misbehave - `undefined <= 0` is false in JS, so the tulip-toggle guard
    // below was skipped on every single shot and the tulips never opened at all, while
    // `Math.max(0, undefined - 1)` turned both counters into NaN and jammed every gate shut for
    // the rest of the round. Silent, total, and invisible in the type system.
    it("survives non-finite counters instead of silently voiding the rules", () => {
        const broken = [
            { ...state(), attackerShotsRemaining: undefined as unknown as number, jackpotShotsRemaining: undefined as unknown as number },
            { ...state(), attackerShotsRemaining: NaN, jackpotShotsRemaining: NaN },
            { ...state(), attackerShotsRemaining: -5, jackpotShotsRemaining: -5 },
        ];
        for (const s of broken) {
            // The tulip must still toggle - this is what the player reported as "not toggling at all".
            const toggled = apply(s, "tulipLeft");
            expect(toggled.nextState.leftTulipOpen).toBe(true);
            expect(toggled.ballsAwarded).toBe(CONSTANTS.sideTulipBalls);

            // And the counters must come back finite rather than propagating NaN forever.
            expect(Number.isFinite(toggled.nextState.attackerShotsRemaining)).toBe(true);
            expect(Number.isFinite(toggled.nextState.jackpotShotsRemaining)).toBe(true);
            expect(Number.isFinite(toggled.nextState.ballsRemaining)).toBe(true);

            // Gates read as closed rather than as an unusable NaN.
            expect(gateFlagsFor(s)).toEqual({ chuckerActive: true, attackerActive: false, jackpotActive: false });
        }
    });

    it("a three-of-a-kind still opens the attacker even from a non-finite starting counter", () => {
        const three: ReelSpinResult = { symbols: ["ITEM_A", "ITEM_A", "ITEM_A"], matchTier: "three", ballsAwarded: 14, attackerOpenShots: ATTACKER_OPEN_SHOTS };
        const broken = { ...state(), attackerShotsRemaining: NaN as number };
        const next = apply(broken, "chucker", three).nextState;
        expect(next.attackerShotsRemaining).toBe(ATTACKER_OPEN_SHOTS);
        expect(gateFlagsFor(next).attackerActive).toBe(true);
    });

    // The property the whole redesign rests on: state is a pure fold over the shot sequence, with
    // no clock and no unshared randomness. Replaying the same shots must always land on exactly
    // the same state - which is what makes the client's local prediction and the server's
    // independent replay agree by construction rather than by careful maintenance.
    it("is a deterministic fold - replaying an identical shot sequence lands on an identical state", () => {
        const script: Array<[Parameters<typeof applyShot>[1], number]> = [
            ["gutter", 1],
            ["tulipLeft", 2],
            ["chucker", 3],
            ["bonusRight", 4],
            ["tulipRight", 5],
            ["gutter", 6],
            ["chucker", 7],
            ["attacker", 8],
            ["jackpot", 9],
            ["tulipLeft", 10],
        ];

        const replay = () => {
            let s = state({ ballsRemaining: 500 });
            for (const [outcome, seed] of script) {
                const reelSpin = outcome === "chucker" ? spinReel(reelRngForSeed(seed)) : undefined;
                s = applyShot(s, outcome, reelSpin, CONSTANTS, 1000, PRICE_PER_BALL).nextState;
            }
            return s;
        };

        expect(replay()).toEqual(replay());
        expect(replay()).toEqual(replay());
    });
});
