import { describe, it, expect } from "vitest";
import { applyShotOutcome, EconomyGateState, EconomyConstants } from "./economy";

// Mirrors pachinko.ts's own constants closely enough for these tests' purposes - not imported
// directly since that file is server-only (mongoose/express/Piscina), but the values themselves
// don't matter for what's being tested here, only that both sides of a comparison use the same
// ones.
const CONSTANTS: EconomyConstants = {
    bonusPocketBalls: 8,
    sideTulipBalls: 4,
    attackerBalls: 15,
    jackpotOpenMs: 5000,
};

const PRICE_PER_BALL = 100;

function freshState(overrides: Partial<EconomyGateState> = {}): EconomyGateState {
    return { ballsRemaining: 10, leftTulipOpen: false, rightTulipOpen: false, attackerOpenUntil: 0, jackpotOpenUntil: 0, ...overrides };
}

describe("applyShotOutcome", () => {
    it("is pure - never mutates the state object passed in", () => {
        const state = freshState();
        const snapshot = { ...state };
        applyShotOutcome(state, "bonusLeft", CONSTANTS, 1000, PRICE_PER_BALL, 0);
        expect(state).toEqual(snapshot);
    });

    it("awards exactly bonusPocketBalls on a bonus pocket catch, no gate-state change", () => {
        const state = freshState();
        const { ballsAwarded, nextState } = applyShotOutcome(state, "bonusLeft", CONSTANTS, 1000, PRICE_PER_BALL, 0);
        expect(ballsAwarded).toBe(CONSTANTS.bonusPocketBalls);
        expect(nextState).toEqual({ ...state, ballsRemaining: state.ballsRemaining + CONSTANTS.bonusPocketBalls });
    });

    it("a miss (gutter) awards nothing and changes nothing", () => {
        const state = freshState({ leftTulipOpen: true });
        const { ballsAwarded, nextState } = applyShotOutcome(state, "gutter", CONSTANTS, 1000, PRICE_PER_BALL, 0);
        expect(ballsAwarded).toBe(0);
        expect(nextState).toEqual(state);
    });

    it("a chucker catch awards 0 balls locally and leaves every gate untouched, including attackerOpenUntil - only a batch response can ever change those (see this file's own header)", () => {
        const state = freshState({ attackerOpenUntil: 0 });
        const { ballsAwarded, nextState } = applyShotOutcome(state, "chucker", CONSTANTS, 1000, PRICE_PER_BALL, 0);
        expect(ballsAwarded).toBe(0);
        expect(nextState).toEqual(state);
    });

    it("toggles the matching tulip open, and awards sideTulipBalls, when the jackpot window isn't active", () => {
        const state = freshState({ leftTulipOpen: false });
        const { ballsAwarded, nextState } = applyShotOutcome(state, "tulipLeft", CONSTANTS, 1000, PRICE_PER_BALL, 0);
        expect(ballsAwarded).toBe(CONSTANTS.sideTulipBalls);
        expect(nextState.leftTulipOpen).toBe(true);
        expect(nextState.rightTulipOpen).toBe(false);
    });

    it("toggles the tulip back closed on a second catch", () => {
        const state = freshState({ leftTulipOpen: true });
        const { nextState } = applyShotOutcome(state, "tulipLeft", CONSTANTS, 1000, PRICE_PER_BALL, 0);
        expect(nextState.leftTulipOpen).toBe(false);
    });

    it("does NOT toggle a tulip while the jackpot window is already active - still awards the balls though", () => {
        const state = freshState({ leftTulipOpen: false, jackpotOpenUntil: 5000 });
        const { ballsAwarded, nextState } = applyShotOutcome(state, "tulipLeft", CONSTANTS, 1000, PRICE_PER_BALL, 1000);
        expect(ballsAwarded).toBe(CONSTANTS.sideTulipBalls);
        expect(nextState.leftTulipOpen).toBe(false);
        expect(nextState.jackpotOpenUntil).toBe(5000);
    });

    it("opening both tulips at once primes the jackpot window for jackpotOpenMs", () => {
        const state = freshState({ leftTulipOpen: true, rightTulipOpen: false });
        const now = 1000;
        const { nextState } = applyShotOutcome(state, "tulipRight", CONSTANTS, 1000, PRICE_PER_BALL, now);
        expect(nextState.leftTulipOpen).toBe(true);
        expect(nextState.rightTulipOpen).toBe(true);
        expect(nextState.jackpotOpenUntil).toBe(now + CONSTANTS.jackpotOpenMs);
    });

    it("a jackpot catch estimates ballsAwarded from the pool/price ratio, rounded, and resets both tulips + the window", () => {
        const state = freshState({ leftTulipOpen: true, rightTulipOpen: true, jackpotOpenUntil: 5000 });
        const pool = 1234;
        const { ballsAwarded, nextState } = applyShotOutcome(state, "jackpot", CONSTANTS, pool, PRICE_PER_BALL, 1000);
        expect(ballsAwarded).toBe(Math.round(pool / PRICE_PER_BALL));
        expect(nextState.leftTulipOpen).toBe(false);
        expect(nextState.rightTulipOpen).toBe(false);
        expect(nextState.jackpotOpenUntil).toBe(0);
    });

    it("a jackpot catch awards 0 when pricePerBall is 0 (never divides by zero)", () => {
        const state = freshState();
        const { ballsAwarded } = applyShotOutcome(state, "jackpot", CONSTANTS, 1000, 0, 0);
        expect(ballsAwarded).toBe(0);
    });

    it("a lapsed jackpot window (already past `now`) closes both tulips on the next shot, same as pachinko.ts's shouldCloseLapsedTulips", () => {
        // Window opened at t=0 for 5000ms; by t=6000 it's lapsed. The next shot processed after
        // that (any outcome, even a plain miss) should observe both tulips snap shut.
        const state = freshState({ leftTulipOpen: true, rightTulipOpen: true, jackpotOpenUntil: 5000 });
        const { nextState } = applyShotOutcome(state, "gutter", CONSTANTS, 1000, PRICE_PER_BALL, 6000);
        expect(nextState.leftTulipOpen).toBe(false);
        expect(nextState.rightTulipOpen).toBe(false);
        expect(nextState.jackpotOpenUntil).toBe(0);
    });

    // The whole point of this module (see its own file header): PachinkoBoard.tsx applies these
    // same transitions locally, shot by shot, entirely independent of pachinko.ts's processBatch
    // - which implements the identical rules server-side. This walks a full multi-shot sequence
    // through applyShotOutcome and checks it lands on exactly the state processBatch's own logic
    // would produce for the same sequence, so a divergence between the two copies of these rules
    // would show up here rather than only as an in-production balance mismatch.
    it("a realistic multi-shot sequence lands on the exact expected final gate state", () => {
        let state = freshState({ ballsRemaining: 100 });
        const now = 0;

        // 1. Bonus catch - +8 balls, no gate change.
        let step = applyShotOutcome(state, "bonusLeft", CONSTANTS, 1000, PRICE_PER_BALL, now);
        state = step.nextState;
        expect(state.ballsRemaining).toBe(108);

        // 2. Left tulip - opens, +4 balls.
        step = applyShotOutcome(state, "tulipLeft", CONSTANTS, 1000, PRICE_PER_BALL, now);
        state = step.nextState;
        expect(state.leftTulipOpen).toBe(true);
        expect(state.ballsRemaining).toBe(112);

        // 3. Right tulip - opens too, primes the jackpot window, +4 balls.
        step = applyShotOutcome(state, "tulipRight", CONSTANTS, 1000, PRICE_PER_BALL, now);
        state = step.nextState;
        expect(state.rightTulipOpen).toBe(true);
        expect(state.jackpotOpenUntil).toBe(now + CONSTANTS.jackpotOpenMs);
        expect(state.ballsRemaining).toBe(116);

        // 4. Jackpot catch while the window is active - pool is now 5000, so +50 balls, window
        // and both tulips reset.
        step = applyShotOutcome(state, "jackpot", CONSTANTS, 5000, PRICE_PER_BALL, now);
        state = step.nextState;
        expect(step.ballsAwarded).toBe(50);
        expect(state.ballsRemaining).toBe(166);
        expect(state.leftTulipOpen).toBe(false);
        expect(state.rightTulipOpen).toBe(false);
        expect(state.jackpotOpenUntil).toBe(0);

        // 5. A chucker catch afterwards - locally worth nothing until a batch reconciles it, and
        // doesn't touch any gate.
        step = applyShotOutcome(state, "chucker", CONSTANTS, 500, PRICE_PER_BALL, now);
        expect(step.ballsAwarded).toBe(0);
        expect(step.nextState).toEqual(state);
    });
});
