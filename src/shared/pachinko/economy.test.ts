import { describe, it, expect } from "vitest";
import { applyShot, gateFlagsFor, PachinkoGateState, PachinkoPayoutConstants } from "./economy";
import { spinReel, reelRngForSeed, ReelSpinResult } from "./pachinkoReels";
import { ATTACKER_OPEN_MS, JACKPOT_OPEN_MS, REEL_LANDED_MS } from "./pachinkoRules";

const CONSTANTS: PachinkoPayoutConstants = { bonusPocketBalls: 2, sideTulipBalls: 2, attackerBalls: 24 };
const PRICE_PER_BALL = 100;
// A fixed, unremarkable flight time used everywhere a test doesn't care about its exact value -
// only that landing happens some nonzero time after firing, same as a real ball.
const FLIGHT_MS = 500;

function state(overrides: Partial<PachinkoGateState> = {}): PachinkoGateState {
    return {
        ballsRemaining: 100,
        leftTulipOpen: false,
        rightTulipOpen: false,
        attackerOpenFromMs: 0,
        attackerOpenUntilMs: 0,
        jackpotOpenFromMs: 0,
        jackpotOpenUntilMs: 0,
        ...overrides,
    };
}

// Fires at `firedAtMs` with a FLIGHT_MS flight unless overridden - mirrors applyShot's real
// signature without every call site having to spell out the same two trailing numbers.
const apply = (s: PachinkoGateState, outcome: Parameters<typeof applyShot>[1], firedAtMs: number, reelSpin?: ReelSpinResult, flightMs = FLIGHT_MS) =>
    applyShot(s, outcome, reelSpin, CONSTANTS, 1000, PRICE_PER_BALL, firedAtMs, flightMs);

const THREE: ReelSpinResult = { symbols: ["ITEM_A", "ITEM_A", "ITEM_A"], matchTier: "three", ballsAwarded: 14, attackerOpenMs: ATTACKER_OPEN_MS };

describe("gateFlagsFor", () => {
    it("chucker and attacker share one gate - the chucker only scores while the attacker isn't running", () => {
        expect(gateFlagsFor(state(), 0)).toEqual({ chuckerActive: true, attackerActive: false, jackpotActive: false });
        expect(gateFlagsFor(state({ attackerOpenFromMs: 900, attackerOpenUntilMs: 5000 }), 1000)).toEqual({ chuckerActive: false, attackerActive: true, jackpotActive: false });
    });

    it("the jackpot is live exactly while the firing time falls within [from, until)", () => {
        const s = state({ jackpotOpenFromMs: 1000, jackpotOpenUntilMs: 5000 });
        expect(gateFlagsFor(s, 999).jackpotActive).toBe(false); // before the window opens
        expect(gateFlagsFor(s, 1000).jackpotActive).toBe(true); // opens
        expect(gateFlagsFor(s, 4999).jackpotActive).toBe(true);
        expect(gateFlagsFor(s, 5000).jackpotActive).toBe(false); // closes
        expect(gateFlagsFor(state({ jackpotOpenFromMs: 0, jackpotOpenUntilMs: 0 }), 0).jackpotActive).toBe(false);
    });

    // The bug this two-sided design exists to close. A window's boundaries are set the moment its
    // catch's fold runs - near-instantly, well before that ball has visibly landed, let alone before
    // a chucker's reel has visibly revealed a match. A shot fired in that gap must not see the gate
    // as already open just because its firedAtMs happens to be under the CLOSE time; it also has to
    // be at or after the OPEN time. Without the open bound, this reopens "the attacker opens before
    // the reel reveals it" through the fold instead of the display.
    it("is not active for a firedAtMs that falls before the window's own open bound, even though it's under the close bound", () => {
        const s = state({ attackerOpenFromMs: 1840, attackerOpenUntilMs: 3840 });
        expect(gateFlagsFor(s, 500).attackerActive).toBe(false); // under 3840, but before 1840
        expect(gateFlagsFor(s, 500).chuckerActive).toBe(true); // so the chucker is still open here
    });
});

describe("applyShot", () => {
    it("is pure - never mutates the state passed in", () => {
        const s = state();
        const snapshot = { ...s };
        apply(s, "bonusLeft", 0);
        expect(s).toEqual(snapshot);
    });

    it("charges exactly one ball for firing, on every outcome including a miss", () => {
        expect(apply(state(), "gutter", 0).nextState.ballsRemaining).toBe(99);
        expect(apply(state(), "bonusLeft", 0).nextState.ballsRemaining).toBe(99 + CONSTANTS.bonusPocketBalls);
        expect(apply(state({ attackerOpenFromMs: 0, attackerOpenUntilMs: 5000 }), "attacker", 0).nextState.ballsRemaining).toBe(99 + CONSTANTS.attackerBalls);
    });

    it("toggles the matching tulip and pays the tulip award", () => {
        const first = apply(state(), "tulipLeft", 0);
        expect(first.ballsAwarded).toBe(CONSTANTS.sideTulipBalls);
        expect(first.nextState.leftTulipOpen).toBe(true);
        expect(first.nextState.rightTulipOpen).toBe(false);
        // Catching it again closes it back up.
        expect(apply(first.nextState, "tulipLeft", 1000).nextState.leftTulipOpen).toBe(false);
    });

    it("opening both tulips primes the jackpot for exactly JACKPOT_OPEN_MS, opening as the priming ball LANDS", () => {
        const next = apply(state({ leftTulipOpen: true }), "tulipRight", 1000).nextState;
        const landsAtMs = 1000 + FLIGHT_MS;
        expect(next.jackpotOpenFromMs).toBe(landsAtMs);
        expect(next.jackpotOpenUntilMs).toBe(landsAtMs + JACKPOT_OPEN_MS);
        // Not yet open at the priming shot's own fire time - the window starts at landing, not fire.
        expect(gateFlagsFor(next, 1000).jackpotActive).toBe(false);
        expect(gateFlagsFor(next, landsAtMs).jackpotActive).toBe(true);
    });

    it("the jackpot window covers exactly its duration from landing, then closes and resets both tulips", () => {
        const primedAt = 1000;
        let s = apply(state({ leftTulipOpen: true }), "tulipRight", primedAt).nextState;
        const landsAtMs = primedAt + FLIGHT_MS;
        expect(gateFlagsFor(s, landsAtMs).jackpotActive).toBe(true);
        expect(gateFlagsFor(s, landsAtMs + JACKPOT_OPEN_MS - 1).jackpotActive).toBe(true);
        expect(gateFlagsFor(s, landsAtMs + JACKPOT_OPEN_MS).jackpotActive).toBe(false);

        // A shot fired after the boundary is what actually performs the reset - nothing here reads
        // a clock on its own, so the lapse only takes effect once some shot's own firedAtMs crosses it.
        s = apply(s, "gutter", landsAtMs + JACKPOT_OPEN_MS).nextState;
        expect(s.jackpotOpenFromMs).toBe(0);
        expect(s.jackpotOpenUntilMs).toBe(0);
        expect(s.leftTulipOpen).toBe(false);
        expect(s.rightTulipOpen).toBe(false);
    });

    it("tulips don't re-toggle while the jackpot window they primed is reserved - including the gap before it opens", () => {
        const primed = apply(state({ leftTulipOpen: true }), "tulipRight", 0).nextState;
        // Fired before the window's own open bound (jackpotOpenFromMs = FLIGHT_MS) - still blocked,
        // since a reservation exists for the whole time it's outstanding, not just while paying.
        const inGapAt = FLIGHT_MS - 10;
        const inGap = apply(primed, "tulipLeft", inGapAt);
        expect(inGap.ballsAwarded).toBe(CONSTANTS.sideTulipBalls); // still pays
        expect(inGap.nextState.leftTulipOpen).toBe(true); // but doesn't flip
        expect(inGap.nextState.jackpotOpenUntilMs).toBe(primed.jackpotOpenUntilMs); // and doesn't re-prime/extend

        // Same, once genuinely inside the paying window.
        const duringAt = FLIGHT_MS + 10;
        const during = apply(primed, "tulipLeft", duringAt);
        expect(during.nextState.leftTulipOpen).toBe(true);
    });

    it("catching the jackpot closes its window immediately and resets both tulips", () => {
        const primed = apply(state({ leftTulipOpen: true }), "tulipRight", 0).nextState;
        const catchAt = FLIGHT_MS + 10;
        const hit = apply(primed, "jackpot", catchAt);
        expect(hit.outcome).toBe("jackpot");
        expect(hit.ballsAwarded).toBe(Math.round(1000 / PRICE_PER_BALL));
        expect(hit.nextState.jackpotOpenFromMs).toBe(0);
        expect(hit.nextState.jackpotOpenUntilMs).toBe(0);
        expect(hit.nextState.leftTulipOpen).toBe(false);
        expect(hit.nextState.rightTulipOpen).toBe(false);
    });

    it("a chucker pays only what its reel spin says, and only a three-of-a-kind opens the attacker - starting when the REEL reveals it, not when the ball lands", () => {
        const noMatch: ReelSpinResult = { symbols: ["ITEM_A", "ITEM_B", "ITEM_C"], matchTier: "none", ballsAwarded: 0, attackerOpenMs: 0 };

        const miss = apply(state(), "chucker", 0, noMatch);
        expect(miss.ballsAwarded).toBe(0);
        expect(miss.nextState.attackerOpenUntilMs).toBe(0);

        const win = apply(state(), "chucker", 0, THREE);
        expect(win.ballsAwarded).toBe(14);
        const revealAtMs = FLIGHT_MS + REEL_LANDED_MS;
        expect(win.nextState.attackerOpenFromMs).toBe(revealAtMs);
        expect(win.nextState.attackerOpenUntilMs).toBe(revealAtMs + ATTACKER_OPEN_MS);
        // Not active yet right as the ball lands - only once the reel itself has stopped.
        expect(gateFlagsFor(win.nextState, FLIGHT_MS).attackerActive).toBe(false);
        expect(gateFlagsFor(win.nextState, revealAtMs).attackerActive).toBe(true);
    });

    it("stacked three-of-a-kinds extend the attacker window from wherever it currently ends, rather than resetting it", () => {
        const once = apply(state(), "chucker", 0, THREE).nextState;
        // Fired again while the window from the first catch hasn't opened yet (still in the gap
        // before attackerOpenFromMs) - legitimately catchable, since the chucker is still open there.
        const secondFiredAt = 500;
        expect(gateFlagsFor(once, secondFiredAt).chuckerActive).toBe(true);
        const twice = apply(once, "chucker", secondFiredAt, THREE).nextState;
        const secondRevealAtMs = secondFiredAt + FLIGHT_MS + REEL_LANDED_MS;
        // Extends UNTIL from the LATER of (existing boundary, this reveal) - since the first window
        // is still running past this reveal, it extends from the existing boundary. FROM is
        // unaffected (this catch's own reveal is later than the already-recorded open bound).
        expect(twice.attackerOpenFromMs).toBe(once.attackerOpenFromMs);
        expect(twice.attackerOpenUntilMs).toBe(Math.max(once.attackerOpenUntilMs, secondRevealAtMs) + ATTACKER_OPEN_MS);
        expect(twice.attackerOpenUntilMs).toBeGreaterThan(once.attackerOpenUntilMs);
    });

    // A later-fired catch's own reveal can happen SOONER than an earlier one's, because flight time
    // varies with pin scatter, not launch power or fire order - a short-flight catch fired after a
    // long-flight one can reveal first. When that happens, the window's open bound has to move
    // earlier to match: the attacker genuinely becomes catchable at whichever reveal happens first,
    // not at whichever catch happened to fold first.
    it("a stacked catch whose own reveal is EARLIER than the recorded open bound pulls the open bound forward", () => {
        // A long flight, so its reveal is a while after it fires.
        const once = apply(state(), "chucker", 0, THREE, 2000).nextState;
        const firstRevealAtMs = 2000 + REEL_LANDED_MS; // 3340
        expect(once.attackerOpenFromMs).toBe(firstRevealAtMs);

        // Fired soon after, with a much shorter flight, so ITS reveal lands earlier in real terms -
        // still legitimately catchable, since firing at 400 is before the first catch's own open bound.
        const secondFiredAt = 400;
        expect(gateFlagsFor(once, secondFiredAt).chuckerActive).toBe(true);
        const twice = apply(once, "chucker", secondFiredAt, THREE, 100).nextState;
        const secondRevealAtMs = secondFiredAt + 100 + REEL_LANDED_MS; // 1840
        expect(secondRevealAtMs).toBeLessThan(firstRevealAtMs);

        expect(twice.attackerOpenFromMs).toBe(secondRevealAtMs);
        expect(twice.attackerOpenUntilMs).toBe(Math.max(once.attackerOpenUntilMs, secondRevealAtMs) + ATTACKER_OPEN_MS);
    });

    // The opposite of stacking: a catch whose reveal happens strictly after a PREVIOUS window has
    // already fully closed is an unrelated, later event - it must start a brand new window (its own
    // open bound), not extend the stale one, or the gate would read as open through a gap where it
    // was genuinely closed.
    it("a catch arriving after the previous window has fully closed starts a fresh window, not an extension of the stale one", () => {
        const once = apply(state(), "chucker", 0, THREE).nextState; // closes at 1840 + ATTACKER_OPEN_MS
        const wayLaterAt = once.attackerOpenUntilMs + 5000;
        const fresh = apply(once, "chucker", wayLaterAt, THREE).nextState;
        const freshRevealAtMs = wayLaterAt + FLIGHT_MS + REEL_LANDED_MS;
        expect(fresh.attackerOpenFromMs).toBe(freshRevealAtMs); // not once.attackerOpenFromMs
        expect(fresh.attackerOpenUntilMs).toBe(freshRevealAtMs + ATTACKER_OPEN_MS); // not extended from the stale value
    });

    it("a jackpot catch awards 0 rather than dividing by zero when pricePerBall is 0", () => {
        expect(applyShot(state({ jackpotOpenFromMs: 0, jackpotOpenUntilMs: 5000 }), "jackpot", undefined, CONSTANTS, 1000, 0, 0, FLIGHT_MS).ballsAwarded).toBe(0);
    });

    // Regression test for a real, shipped bug. One API response briefly sent the OLD field names,
    // so the boundaries arrived `undefined`. That didn't merely misbehave - `undefined <=/>=` is
    // false in JS either direction, so a guard reading the raw field could be silently skipped or
    // silently always-true depending on its shape, and arithmetic on `undefined` propagates NaN
    // forever after. Silent, total, and invisible in the type system.
    it("survives non-finite window boundaries instead of silently voiding the rules", () => {
        const broken = [
            { ...state(), attackerOpenFromMs: undefined as unknown as number, attackerOpenUntilMs: undefined as unknown as number, jackpotOpenFromMs: undefined as unknown as number, jackpotOpenUntilMs: undefined as unknown as number },
            { ...state(), attackerOpenFromMs: NaN, attackerOpenUntilMs: NaN, jackpotOpenFromMs: NaN, jackpotOpenUntilMs: NaN },
            { ...state(), attackerOpenFromMs: -5, attackerOpenUntilMs: -5, jackpotOpenFromMs: -5, jackpotOpenUntilMs: -5 },
        ];
        for (const s of broken) {
            // The tulip must still toggle - this is what the player reported as "not toggling at all".
            const toggled = apply(s, "tulipLeft", 0);
            expect(toggled.nextState.leftTulipOpen).toBe(true);
            expect(toggled.ballsAwarded).toBe(CONSTANTS.sideTulipBalls);

            // And the boundaries must come back finite rather than propagating NaN forever.
            expect(Number.isFinite(toggled.nextState.attackerOpenFromMs)).toBe(true);
            expect(Number.isFinite(toggled.nextState.attackerOpenUntilMs)).toBe(true);
            expect(Number.isFinite(toggled.nextState.jackpotOpenFromMs)).toBe(true);
            expect(Number.isFinite(toggled.nextState.jackpotOpenUntilMs)).toBe(true);
            expect(Number.isFinite(toggled.nextState.ballsRemaining)).toBe(true);

            // Gates read as closed rather than as an unusable NaN.
            expect(gateFlagsFor(s, 0)).toEqual({ chuckerActive: true, attackerActive: false, jackpotActive: false });
        }
    });

    it("a three-of-a-kind still opens the attacker even from a non-finite starting boundary", () => {
        const broken = { ...state(), attackerOpenFromMs: NaN as number, attackerOpenUntilMs: NaN as number };
        const next = apply(broken, "chucker", 0, THREE).nextState;
        const revealAtMs = FLIGHT_MS + REEL_LANDED_MS;
        expect(next.attackerOpenFromMs).toBe(revealAtMs);
        expect(next.attackerOpenUntilMs).toBe(revealAtMs + ATTACKER_OPEN_MS);
        expect(gateFlagsFor(next, revealAtMs).attackerActive).toBe(true);
    });

    // The mechanism that closes the real hole this rewrite exists to fix: a stale positive flag
    // (the client's fire-time preview and its fold-time application can legitimately see different
    // states - see fireOnce's own comment in PachinkoBoard.tsx) must never be honoured. applyShot
    // re-derives its own flags from `state` and `firedAtMs` and downgrades the outcome whenever the
    // caller's claim disagrees, rather than trusting whatever it's handed.
    describe("gate enforcement - a claimed outcome whose gate is actually shut scores as a miss", () => {
        it("refuses a jackpot claimed after its window already lapsed", () => {
            const primed = apply(state({ leftTulipOpen: true }), "tulipRight", 0).nextState;
            const lapsedAt = primed.jackpotOpenUntilMs; // exactly the boundary - already closed
            const claimed = apply(primed, "jackpot", lapsedAt, undefined, 0);
            expect(claimed.outcome).toBe("gutter");
            expect(claimed.ballsAwarded).toBe(0);
            // The pool must not be treated as paid out - nothing about the jackpot window changes
            // beyond the ordinary passive lapse-closes-tulips effect every outcome is subject to.
            expect(claimed.nextState.jackpotOpenUntilMs).toBe(0);
        });

        it("refuses a jackpot claimed before its window has opened yet (the from-bound gap)", () => {
            const primed = apply(state({ leftTulipOpen: true }), "tulipRight", 0).nextState;
            const inGapAt = primed.jackpotOpenFromMs - 1;
            const claimed = apply(primed, "jackpot", inGapAt, undefined, 0);
            expect(claimed.outcome).toBe("gutter");
            expect(claimed.ballsAwarded).toBe(0);
        });

        it("refuses an attacker claimed while its window is shut", () => {
            const claimed = apply(state(), "attacker", 0);
            expect(claimed.outcome).toBe("gutter");
            expect(claimed.ballsAwarded).toBe(0);
        });

        it("refuses a chucker claimed while the attacker it shares a gate with is running", () => {
            const claimed = apply(state({ attackerOpenFromMs: 0, attackerOpenUntilMs: 5000 }), "chucker", 0, THREE);
            expect(claimed.outcome).toBe("gutter");
            expect(claimed.ballsAwarded).toBe(0);
            // Must not also extend the very window that shut it out.
            expect(claimed.nextState.attackerOpenUntilMs).toBe(5000);
        });

        it("honours a jackpot claimed while its window is genuinely still open", () => {
            const primed = apply(state({ leftTulipOpen: true }), "tulipRight", 0).nextState;
            const stillOpenAt = primed.jackpotOpenUntilMs - 1;
            const claimed = apply(primed, "jackpot", stillOpenAt, undefined, 0);
            expect(claimed.outcome).toBe("jackpot");
            expect(claimed.ballsAwarded).toBe(Math.round(1000 / PRICE_PER_BALL));
        });
    });

    // The property the whole redesign rests on: state is a pure fold over the shot sequence, with
    // no clock read INSIDE the fold (time only ever arrives as an argument) and no unshared
    // randomness. Replaying the same shots must always land on exactly the same state - which is
    // what makes the client's local prediction and the server's independent replay agree by
    // construction rather than by careful maintenance.
    it("is a deterministic fold - replaying an identical shot sequence lands on an identical state", () => {
        const script: Array<[Parameters<typeof applyShot>[1], number, number]> = [
            ["gutter", 0, 400],
            ["tulipLeft", 400, 1900],
            ["chucker", 800, 2300],
            ["bonusRight", 1200, 1600],
            ["tulipRight", 1600, 2100],
            ["gutter", 2000, 1800],
            ["chucker", 2400, 2000],
            ["attacker", 2800, 1900],
            ["jackpot", 3200, 1700],
            ["tulipLeft", 3600, 2200],
        ];

        const replay = () => {
            let s = state({ ballsRemaining: 500 });
            for (const [outcome, firedAtMs, seed] of script) {
                const reelSpin = outcome === "chucker" ? spinReel(reelRngForSeed(seed)) : undefined;
                s = applyShot(s, outcome, reelSpin, CONSTANTS, 1000, PRICE_PER_BALL, firedAtMs, FLIGHT_MS).nextState;
            }
            return s;
        };

        expect(replay()).toEqual(replay());
        expect(replay()).toEqual(replay());
    });
});
