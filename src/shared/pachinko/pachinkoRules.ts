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
 * ## Why the gate windows are durations again, and why that isn't the old broken design
 *
 * These windows have now been all three of the obvious things, and the history is the argument for
 * the current shape - each version fixed the previous one's real bug and introduced its own.
 *
 * **Epoch timestamps (original).** "Open until 1735689600000". Unworkable, for three reasons that
 * all turned out to be the same reason:
 *
 *   1. The timestamp was minted on ONE machine's clock and compared against the OTHER's. A browser
 *      clock a minute out of sync - extremely common - made a freshly-granted window either already
 *      expired on arrival or effectively permanent, client-side, while the server thought the
 *      opposite.
 *   2. The two sides stamped the window at different moments anyway (client when the shot resolved,
 *      server when the batch was processed, up to a second apart), so even with perfectly synced
 *      clocks the boundary shots landed on opposite sides of the window.
 *   3. Wall-clock time kept running between a shot being decided and the player actually seeing the
 *      ball land, so a window was always partly spent before it was visible.
 *
 * The common root: **somebody read a clock while folding the shot sequence.** Two machines reading
 * two clocks cannot agree.
 *
 * **Ball counts.** Replacing the clock with an integer decremented once per shot removed the
 * disagreement completely - both sides derived byte-identical gate state from the same sequence, by
 * construction. It was right about determinism and wrong about the player. A window measured in
 * balls is spent by balls *already in the air*: measured over a real hold-to-fire session, the
 * ~8.4-ball gap between firing the chucker ball and seeing its reel resolve is longer than the
 * 5-ball window it opens, so 88-100% of attacker windows were completely used up before the player
 * could see the attacker was open. The gate fired on its own and nothing the player did during it
 * mattered.
 *
 * **Durations carried by the shot (current).** Keeps the property that actually made ball counts
 * work - *nothing here reads a clock* - while measuring the thing the player experiences. Time is
 * an INPUT: every shot arrives with `firedAtMs`, and the fold only ever compares numbers that came
 * in with the shots. So the server replaying a batch computes the identical windows the client did,
 * for the same structural reason ball counts did.
 *
 * Two details do the load-bearing work:
 *
 *   - `firedAtMs` is a **duration since the round started**, off a monotonic clock, never an epoch
 *     timestamp. It is never compared against anyone else's clock, so a device whose wall clock is
 *     wrong - point 1 above - cannot affect it at all.
 *   - A window opens at the moment the player can SEE it open: the firing time plus the ball's own
 *     flight (deterministic from its trajectory) plus REEL_LANDED_MS. Both sides compute that from
 *     the shot alone. That's what point 3 above never had.
 *
 * The one thing ball counts gave for free was a rate cap - one shot per ball is a hard ceiling on
 * how many shots fit in a window. Durations need that stated explicitly instead; see
 * MIN_SHOT_SPACING_MS.
 */

// How fast the board fires while the launch button is held (100 balls/minute).
//
// It lives here, next to the window durations, because it is no longer purely a client animation
// detail: the moment a window stopped being counted in balls, "how many balls is this window worth"
// became a function of the fire rate, and that question is asked well outside the client -
// pachinkoPayoutTuning.ts's whole attacker term is `window / this`. The durations below were chosen
// against this number, so changing it silently re-prices the board's largest RTP term. Change one,
// re-run the tuning script.
export const HOLD_TO_FIRE_INTERVAL_MS = 400;

// How long the attacker gate stays open once a reel three-of-a-kind reveals it. Queued matches
// (multiple chucker catches landing close together under hold-to-fire) EXTEND the window from
// whenever it currently ends rather than resetting it - see economy.ts's own chucker branch.
//
// NOT a literal ball-count conversion, on purpose. A direct 5-ball-at-400ms conversion (2000ms)
// measured worst-case RTP at 1.4323 - meaningfully above the ~1.1952 ATTACKER_BALLS=20 was set
// against - and that increase is real, not noise: this whole rewrite exists because the OLD,
// ball-counted window opened before the player could see it and was mostly spent on balls already
// in flight, so its true value was a small fraction of its nominal 5 balls (measured 0.00-0.12
// usable balls per window, essentially dead). Now that the open bound is anchored to the reel's own
// reveal and the display renders it live, the window is genuinely usable (measured ~3.3-3.9 usable
// balls at this length) - so a literal conversion would have paid out close to its full nominal
// value for the first time, which costs more than the constants were tuned against.
//
// 1300ms re-derives the window's length from the RTP it should cost rather than from the ball count
// it replaced, and measured worst-case RTP at 1.0478 - under the old 1.1952 baseline, not over it
// (Monte Carlo noise at this sample size is real; landing a bit under is the safe direction to be
// wrong in). If this needs adjusting again, re-check RTP (pachinkoPayoutTuning.ts) AND playability
// together, not just RTP alone - they trade off directly against each other here, and a shorter
// window that looks fine on RTP can quietly slide back toward the "opens but you can't react" state
// this whole design exists to avoid. There's no packaged playability tool for this specific
// question yet; measuring it means simulating a hold-to-fire burst end to end (real trajectories,
// the fold, and the ledger's fire-order + reel-serialization rules) and counting usable balls per
// window, the same way it was measured to arrive at this value.
//
// The length has been cut hard before and the reasoning still applies. A literal conversion of the
// ORIGINAL 15s window was worth hundreds of balls per trigger: the attacker is caught 30-50% of the
// time while open at the launch powers that reach it, and measured worst-case RTP at that length was
// 551%, of which the attacker term alone was 5.01 out of 5.52. Window length and ATTACKER_BALLS
// multiply, so this constant is the cheapest lever on the board's largest RTP term - see
// ATTACKER_BALLS in pachinkoPayouts.ts, which is currently deliberately generous.
export const ATTACKER_OPEN_MS = 1300;

// How long the jackpot pocket pays for once both tulips are simultaneously open - same window shape
// as the attacker, not a standing "primed" state that sits open indefinitely until caught. 4800ms
// is the same conversion of the 12-ball window it replaces.
export const JACKPOT_OPEN_MS = 4800;

// When all three reels have stopped, relative to a spin starting. This is the moment the reel has
// told the player what it rolled - the celebratory glow that follows carries no information, which
// is why it isn't part of this. It lives here rather than with the client's other animation timings
// because the FOLD needs it now: it's what anchors a window's opening to the moment the player can
// see it. Client-side reel rendering must keep matching it, or the gate opens at a time the board
// isn't showing (see PachinkoBoard.tsx, which derives its animation from this).
export const REEL_LANDED_MS = 1340;

// Minimum gap between consecutive shots' firedAtMs that the server will accept.
//
// This is the anti-cheat floor that ball counting used to provide implicitly. A window measured in
// balls caps its own value: five balls is five balls, however fast you fire. A window measured in
// time does not - a client that lies about its timings could claim fifty shots inside one 2000ms
// window and multiply the attacker's payout by ten.
//
// So the ceiling is stated instead of implied. 300ms sits under the 400ms hold-to-fire cadence with
// enough slack for timer jitter and a slow frame, while bounding a window to roughly the balls a
// legitimate client could actually have fired in it - the same bound, arrived at explicitly. See
// pachinko.ts's processBatch, which rejects a batch that violates it rather than quietly clamping:
// a client that cannot produce sane timings is one to distrust, not to correct.
export const MIN_SHOT_SPACING_MS = 300;

// Two-of-a-kind is a top-up and opens nothing; three-of-a-kind is bigger AND opens the attacker
// (see ATTACKER_OPEN_MS above) - only the "three" tier touches the attacker at all.
//
// Raised together with BONUS_POCKET_BALLS, SIDE_TULIP_BALLS and ATTACKER_BALLS (see
// pachinkoPayouts.ts) - a deliberate, explicitly-requested increase, not a tuning-script result.
// These two are the biggest single driver of the resulting cost: at the board's current worst
// case (251.93% at power 50), the reel term alone is 1.32 of the 2.5193 total, larger than every
// other term combined. See ATTACKER_BALLS's own comment for the full breakdown and why the
// window length can no longer compensate for it the way it has in the past.
export const REEL_TWO_MATCH_BALLS = 10;
export const REEL_THREE_MATCH_BALLS = 15;
