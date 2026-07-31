/**
 * The gameplay constants BOTH sides need to derive round state identically - the reel's payouts
 * and the two gate windows. These live here, in shared/, rather than in the server-only
 * pachinkoPayouts.ts, because the client's own local economy mirror (economy.ts) and the server's
 * authoritative replay (pachinko.ts's processBatch) must apply literally the same numbers, or the
 * two derivations drift apart and the player sees pockets fire that the server never scored.
 * pachinkoPayouts.ts re-exports these so existing server-side imports keep working; the real
 * money-side constants (contribution rate, cash-out rate, payout cap) stay there, server-only,
 * since the client never needs them to derive gate state.
 *
 * ## Why the gate windows are measured in BALLS, not seconds
 *
 * Both windows used to be absolute epoch-millisecond timestamps ("open until 1735689600000").
 * That is unworkable in a design where the client simulates locally and the server independently
 * replays, for three compounding reasons:
 *
 *   1. The timestamp was minted on ONE machine's clock and compared against the OTHER's. A
 *      browser clock a minute out of sync - extremely common - made a freshly-granted window
 *      either already expired on arrival or effectively permanent, client-side, while the server
 *      thought the opposite.
 *   2. The two sides stamped the window at different moments anyway (client when the shot
 *      resolved, server when the batch was processed, up to a second apart), so even with
 *      perfectly synced clocks the boundary shots landed on opposite sides of the window.
 *   3. Wall-clock time keeps running between a shot being decided and the player actually seeing
 *      the ball land, so a window was always partly spent before it was visible.
 *
 * Counting BALLS instead removes the clock from shared state entirely. A window is now a plain
 * integer decremented once per shot processed, so both sides derive byte-identical gate state
 * from the same shot sequence, by construction - not "usually", but necessarily. It's also more
 * honest to the player: "12 balls left" is exact and fully under their control, where a countdown
 * was already draining before they could react to it.
 */

// How many subsequent balls the attacker gate stays open for after a reel three-of-a-kind.
// Queued matches (multiple chucker catches landing close together under hold-to-fire) each ADD
// this many balls on top of whatever is currently left rather than resetting it - see
// pachinko.ts's own chucker branch.
//
// A literal conversion of the 15s window this replaced would be ~37 balls at the ~400ms
// hold-to-fire cadence, and that turned out to be wildly over-generous: the attacker is caught
// 30-50% of the time while open at the launch powers that reach it, so 37 open balls is worth
// hundreds of balls per trigger. Measured worst-case RTP at that length was 551%, of which the
// attacker term alone was 5.01 out of 5.52.
//
// That was a pre-existing balance bug this rewrite surfaced rather than caused: the RTP model
// used to charge a single attacker attempt per three-of-a-kind (see pachinkoPayoutTuning.ts's
// header), so the real cost of the window was never counted at all - which is very likely why
// the house was losing money on this board. Making the window an explicit ball count is what
// made it measurable. 8 balls, paired with ATTACKER_BALLS, puts worst-case RTP back near the 0.9
// target while leaving the attacker a visible, genuinely valuable bonus round.
// Trimmed again from 8 after the left field went in. That geometry routes a lot more balls into
// the chucker (18% of shots at the worst-case power, up from ~9%), and since every chucker catch is
// a chance to open this window, the window's length multiplies straight into the board's largest
// RTP term. Shortening it is cheaper than gutting ATTACKER_BALLS, which is what makes the bonus
// round feel worth triggering.
export const ATTACKER_OPEN_SHOTS = 5;

// How many subsequent balls the jackpot pocket pays for once both tulips are simultaneously open
// - same window shape as the attacker, not a standing "primed" state that sits open indefinitely
// until caught. Derived from the 5s window this replaced at the same cadence: 5000/400 ~= 12.
export const JACKPOT_OPEN_SHOTS = 12;

// Two-of-a-kind is a small top-up and opens nothing; three-of-a-kind is bigger AND opens the
// attacker (see ATTACKER_OPEN_SHOTS above) - only the "three" tier touches the attacker at all.
export const REEL_TWO_MATCH_BALLS = 2;
export const REEL_THREE_MATCH_BALLS = 8;
