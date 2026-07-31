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
 * to derive. These WERE untuned starting values, and it showed: a Monte Carlo sweep across the
 * full launch-power range (see pachinkoPayoutTuning.ts, the repeatable tool that produced these
 * numbers) found the side tulip has a physics/nail-field sweet spot around launch power ~20-25
 * where it's caught 30-38% of the time - versus single-digit percent almost everywhere else on
 * the power range - pushing worst-case RTP as high as ~300% for a player who found that power
 * and just fired there every time. That's the mechanism behind the house losing money, not a
 * generally-too-generous board. Re-run pachinkoPayoutTuning.ts and update these constants again
 * if the board geometry (pachinkoLayout.ts), physics tuning (pachinkoPhysics.ts), or reel
 * weights (pachinkoReels.ts) ever change - none of this is derivable by hand from the geometry
 * alone, the same way Plinko's own MULTIPLIERS table isn't (see plinkoLayout.ts).
 */
import { capPayout } from "./payoutCap";

// The constants BOTH sides need to derive round state identically live in shared/ (see
// pachinkoRules.ts's own header for why the gate windows are counted in balls rather than
// seconds). Re-exported here so this file stays the single import site for everything
// payout-related on the server.
export { ATTACKER_OPEN_SHOTS, JACKPOT_OPEN_SHOTS, REEL_TWO_MATCH_BALLS, REEL_THREE_MATCH_BALLS } from "../../../shared/pachinko/pachinkoRules";

// Frequent, small top-ups - the easiest pocket to catch on the board (see pachinkoLayout.ts's
// BONUS_POCKETS, the widest non-jackpot target).
export const BONUS_POCKET_BALLS = 2;

// Catching a side tulip also toggles it open/closed - both open at once primes the jackpot. Cut
// hardest of every constant in this file (was 8) - this is the pocket with the exploitable
// power sweet spot described above, so its own worst-case-power EV alone had to come down to
// target before anything else in the board's economy could be trusted.
export const SIDE_TULIP_BALLS = 2;

// The chucker itself never pays balls directly - it only fires the board's central reel gimmick
// (see shared/pachinko/pachinkoReels.ts), a real modern machine's own "heso" -> LCD reel -> bonus
// round flow. Only a three-of-a-kind match opens the attacker gate; a miss or a two-of-a-kind
// opens nothing - the chucker's own catch does not unconditionally open the attacker. How long
// it stays open (ATTACKER_OPEN_SHOTS) and what each match tier pays (REEL_TWO/THREE_MATCH_BALLS)
// are re-exported from shared/pachinko/pachinkoRules.ts at the top of this file.

// A big, rare payout - the attacker is a wide target, but only reachable during its short open
// window, and only reachable AT ALL via a chucker catch that also lands a reel match. Cut from 24
// alongside shortening the window itself (see ATTACKER_OPEN_SHOTS in
// shared/pachinko/pachinkoRules.ts): the two multiply, and the pair together was carrying ~91% of
// the board's entire worst-case RTP once the window's real cost was measured properly.
export const ATTACKER_BALLS = 9;

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

// Hard ceiling on a single cash-out's payout - see payoutCap.ts.
export const MAX_PAYOUT = 10_000_000;

export function jackpotBalls(poolValue: number, pricePerBall: number): number {
    return Math.max(0, Math.round(poolValue / pricePerBall));
}

export function cashOutAmount(balls: number, pricePerBall: number): number {
    return capPayout(balls * pricePerBall * CASH_OUT_RATE, MAX_PAYOUT);
}
