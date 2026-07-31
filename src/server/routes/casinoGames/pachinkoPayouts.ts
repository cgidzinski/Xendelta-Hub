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
export { ATTACKER_OPEN_MS, JACKPOT_OPEN_MS, REEL_TWO_MATCH_BALLS, REEL_THREE_MATCH_BALLS } from "../../../shared/pachinko/pachinkoRules";

// Frequent, small top-ups - the easiest pocket to catch on the board (see pachinkoLayout.ts's
// BONUS_POCKETS, the widest non-jackpot target). Cut to 1 when the left field went in: the far-left
// descent that used to drain now lands here instead, so the bonus pockets catch a great deal more
// than they did (27% of shots at the top of the launch range, up from ~1%).
export const BONUS_POCKET_BALLS = 1;

// Catching a side tulip also toggles it open/closed - both open at once primes the jackpot. Cut
// hardest of every constant in this file (was 8, then 2) - this is the pocket with the exploitable
// power sweet spot described above, so its own worst-case-power EV alone had to come down to
// target before anything else in the board's economy could be trusted.
//
// Briefly cut to 1 when the tulips moved inward, on the assumption the extra reach had to be paid
// for out of the tulip's own payout. Re-measuring said otherwise and it's back at 2: at the board's
// worst-case power the tulip term is only 0.12 of a total 1.41, while the reel and attacker chain
// together carry 1.07 of it. Tulips are no longer where this board leaks - the chucker is - so
// paying them properly costs little and keeps the one pocket that takes actual aim worth aiming at.
export const SIDE_TULIP_BALLS = 2;

// The chucker itself never pays balls directly - it only fires the board's central reel gimmick
// (see shared/pachinko/pachinkoReels.ts), a real modern machine's own "heso" -> LCD reel -> bonus
// round flow. Only a three-of-a-kind match opens the attacker gate; a miss or a two-of-a-kind
// opens nothing - the chucker's own catch does not unconditionally open the attacker. How long
// it stays open (ATTACKER_OPEN_MS) and what each match tier pays (REEL_TWO/THREE_MATCH_BALLS)
// are re-exported from shared/pachinko/pachinkoRules.ts at the top of this file.

// A big, rare payout - the attacker is a wide target, but only reachable during its short open
// window, and only reachable AT ALL via a chucker catch that also lands a reel match. Cut from 24
// to 9 alongside shortening the window itself (see ATTACKER_OPEN_MS in
// shared/pachinko/pachinkoRules.ts): the two multiply, and the pair together was carrying ~91% of
// the board's entire worst-case RTP once the window's real cost was measured properly. Trimmed
// again to 6, with the window down to 5 balls, after the left field raised the chucker rate that
// feeds this whole chain to 18% at the worst-case power.
//
// ## 20 is a deliberate product decision that the tuning script will disagree with
//
// Do not "fix" this back on the strength of a pachinkoPayoutTuning.ts run. It is knowingly above
// what that script targets, and it was raised 6 -> 20 on purpose: the attacker is the rarest thing
// on the board (it needs a chucker catch AND a reel three-of-a-kind, roughly 9% of catches) and at
// 6 balls it wasn't worth chasing, which made the board's whole bonus-round structure pointless.
//
// The cost was measured, not guessed, before and after. At 6: worst-case RTP 0.830 at power 50,
// attacker chain 0.156 of that. At 20, measured against the window this board HAD at the time (a
// ball-counted one that opened before the player could see it, so most of its nominal length was
// unreachable): worst-case RTP 1.1952, attacker chain 0.568. No compensating cut was made anywhere
// else; that was the call. pachinkoPayouts.rtp.test.ts's upper bound was widened to suit.
//
// That measurement changed again once the window became genuinely reachable (see ATTACKER_OPEN_MS
// in shared/pachinko/pachinkoRules.ts for why "reachable" wasn't true before) - a fully usable
// window pays out closer to its nominal value, which cost more, so ATTACKER_OPEN_MS was shortened
// to bring the worst case back down rather than touching this number. Current measured worst case:
// 1.0478. If it ever needs walking back further, that duration is still the cheapest lever, not
// this constant - window length and per-catch value multiply.
export const ATTACKER_BALLS = 20;

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
