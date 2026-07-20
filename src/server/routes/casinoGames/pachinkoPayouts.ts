/**
 * Pachinko payout/economy constants - a real ball economy, not instant cash. Every pocket on
 * the board (bonus, tulip, chucker, attacker, jackpot) pays out in BALLS, never cheddar
 * directly - the only way real money ever moves out of a round is the player pressing Cash Out
 * (see pachinko.ts's /cashout handler), which converts their whole current ball count to
 * cheddar at CASH_OUT_RATE and ends the round. This mirrors how a real parlor works: catches
 * fill your tray, you take the tray to the counter when you're done.
 *
 * There's no weighted pocket table here (unlike Plinko's plinkoOdds.ts) - the outcome comes
 * from a real physics simulation, not a pre-selected probability, so there's no closed-form RTP
 * to derive. These are starting values, not tuned against real play data yet.
 */

// Frequent, small top-ups - the easiest pocket to catch on the board (see pachinkoLayout.ts's
// BONUS_POCKETS, the widest non-jackpot target).
export const BONUS_POCKET_BALLS = 3;

// Catching a side tulip also toggles it open/closed - both open at once primes the jackpot.
export const SIDE_TULIP_BALLS = 8;

// The chucker itself never pays balls directly - it only fires the board's central reel gimmick
// (see pachinkoReels.ts), a real modern machine's own "heso" -> LCD reel -> bonus round flow.
// Any match (two or three of a kind) opens the attacker gate for this long; a miss opens nothing
// - the chucker's own catch no longer unconditionally opens the attacker the way it used to.
// Queued matches (multiple chucker catches landing close together under hold-to-fire) each ADD
// this much time on top of whatever's currently left rather than resetting it - see pachinko.ts's
// own chucker branch for the Math.max(now, ...) + ATTACKER_OPEN_MS stacking.
export const ATTACKER_OPEN_MS = 15000;

// Two-of-a-kind is a small top-up; three-of-a-kind is bigger. Both open the attacker (see
// ATTACKER_OPEN_MS above) for the same flat duration - only the ball bonus differs by tier, not
// the attacker window. Modest starting values, same caveat as every other payout in this file.
export const REEL_TWO_MATCH_BALLS = 5;
export const REEL_THREE_MATCH_BALLS = 15;

// The chucker also fires the board's central reel gimmick (see pachinkoReels.ts) - a real
// modern machine's own "heso" -> LCD reel -> bonus round flow. Two-of-a-kind is a small top-up;
// three-of-a-kind is bigger and also extends the attacker's own open window, same real-machine
// shape (the reel result IS the bonus-round trigger, not decoration). Modest starting values,
// same caveat as every other payout in this file.
export const REEL_TWO_MATCH_BALLS = 5;
export const REEL_THREE_MATCH_BALLS = 15;
export const REEL_THREE_MATCH_BONUS_MS = 4000;

// A big, rare payout - the attacker is a wide target, but only reachable during its short open
// window, and only reachable AT ALL via a chucker catch that also lands a reel match.
export const ATTACKER_BALLS = 25;

// How long the jackpot pocket actually pays once both tulips are simultaneously open - same
// timed-window shape as the attacker (see pachinko.ts's own jackpot-priming branch), not a
// standing "primed" state that sits open indefinitely until caught.
export const JACKPOT_OPEN_MS = 10000;

// Fraction of every ball's price that feeds the shared jackpot pool (fed by every ball fired,
// not just misses - the pool is jackpot-only money, unrelated to what any individual shot pays
// out). Paid out (converted to balls, see jackpotBalls below) when the primed jackpot pocket is
// caught, then reset. Same shape Slots already uses for its own pool.
export const CONTRIBUTION_RATE = 0.5;

export const JACKPOT_SEED = 0;

// Cash Out converts the whole ball count 1:1 against the price the player paid per ball - no
// skim on top of the physics itself. The house edge lives entirely in the board (most balls
// miss; the expected balls returned per ball fired is well under 1), the same way a real
// parlor's edge lives in how few balls the machine actually returns, not in a worse exchange
// rate at the counter.
export const CASH_OUT_RATE = 1;

export function jackpotBalls(poolValue: number, pricePerBall: number): number {
    return Math.max(0, Math.round(poolValue / pricePerBall));
}

export function cashOutAmount(balls: number, pricePerBall: number): number {
    return balls * pricePerBall * CASH_OUT_RATE;
}
