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
 * to derive. Re-run pachinkoPayoutTuning.ts and re-measure if the board geometry
 * (pachinkoLayout.ts), physics tuning (pachinkoPhysics.ts), or reel weights (pachinkoReels.ts)
 * ever change - none of this is derivable by hand from the geometry alone, the same way
 * Plinko's own MULTIPLIERS table isn't (see plinkoLayout.ts).
 *
 * These WERE untuned starting values, and it showed: an early Monte Carlo sweep found the side
 * tulip had a physics/nail-field sweet spot around launch power ~20-25, caught 30-38% of the
 * time versus single digits almost everywhere else, pushing worst-case RTP to ~300% for a player
 * who found that power and just fired there. That was an EXPLOIT - a narrow, undiscovered hole
 * a rational player could farm - and every constant here was brought down to close it.
 *
 * The board is no longer tuned toward that target. Every payout below was deliberately raised
 * well past what pachinkoPayoutTuning.ts recommends, on request, values chosen directly rather
 * than derived - see ATTACKER_BALLS's own comment for the current measured cost. That is a
 * materially different thing from the original bug: the house now loses money across most of
 * the power range, not narrowly at one exploitable spot, and it's a known, chosen state rather
 * than something discovered and closed. Do not "fix" any of these back toward the tuning
 * script's own numbers without checking with whoever owns this decision first - the script has
 * no way to know the current values are deliberate rather than drifted.
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
//
// Raised to 3 alongside every other payout in this file - see ATTACKER_BALLS's own comment for the
// measured RTP this produced and why it's accepted rather than compensated for.
export const BONUS_POCKET_BALLS = 3;

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
//
// Raised again to 3 alongside every other payout in this file - see ATTACKER_BALLS.
export const SIDE_TULIP_BALLS = 3;

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
// to bring the worst case back down rather than touching this number. Measured worst case at that
// point: 1.0478.
//
// ## Raised again, 20 -> 25, alongside every other payout in this file - a much larger deviation
//
// A direct, explicit request, not a tuning result: BONUS_POCKET_BALLS 1->3, SIDE_TULIP_BALLS 2->3,
// REEL_TWO/THREE_MATCH_BALLS 2/8 -> 10/15 (see pachinkoRules.ts) all moved up in the same pass.
//
// Measured worst-case RTP after: 2.5193 (251.93%) at power 50, breakdown bonus=0.36 tulip=0.40
// reel=1.32 attacker=0.44. The reel term is now the dominant one, by a wide margin, and it's why
// ATTACKER_OPEN_MS can no longer bring this down on its own the way it did the last two times
// this constant rose - the attacker's whole term (0.44) is smaller than the reel term alone, so
// trimming the window to zero wouldn't reach break-even. This was explicitly accepted anyway,
// after being measured and reported: the house loses money across most of the launch-power
// range, not at one narrow exploitable spot - a materially different, much larger decision than
// the 20 -> 25 story above, made on purpose with the number in hand. See this file's own header.
export const ATTACKER_BALLS = 25;

// Fraction of every ball's price that feeds the shared jackpot pool (fed by every ball fired,
// not just misses - the pool is jackpot-only money, unrelated to what any individual shot pays
// out). Paid out (converted to balls, see jackpotBalls below) when the primed jackpot pocket is
// caught, then reset. Same shape Slots already uses for its own pool.
//
// Cut in half, 0.5 -> 0.25, on request: the jackpot pool builds twice as slowly, so it's smaller
// whenever it's hit - a deliberate way to make the jackpot harder to earn without touching any
// per-catch ball amount above (this is excluded from the worst-case RTP the tuning script
// measures - see pachinkoPayoutTuning.ts's own header - so those numbers are unaffected).
export const CONTRIBUTION_RATE = 0.25;

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
