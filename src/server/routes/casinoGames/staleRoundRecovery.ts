/**
 * Shared stale-round sweep loop used by every casino game (Memory, Pachinko, Kitty Scratch,
 * Slots, Plinko, SpinMania, Crossword alike). "Stale" means something different per game - a
 * game that forfeits on abandonment vs. one where the outcome was already decided and may
 * still owe a payout - so the actual settlement (what to transfer, what counts as "played")
 * stays each game's own `settle` callback; this only owns the polling, the per-round
 * try/catch, and the consecutive-failure counting/logging around it, which were otherwise
 * copy-pasted identically into every game file.
 */
const { XenCasinoRound } = require("../../models/xenCasino");

// A round that fails this many consecutive sweep attempts is treated as genuinely stuck (not
// just transient) and gets a louder log line.
export const SWEEP_FAILURE_ALERT_THRESHOLD = 5;

export async function sweepStaleRounds(game: string, ttlMs: number, settle: (round: any) => Promise<void>, label: string = game): Promise<void> {
    const stale = await XenCasinoRound.sweepStale(game, ttlMs);
    for (const round of stale) {
        try {
            await settle(round);
        } catch (err) {
            const failureCount = await XenCasinoRound.recordSweepFailure(round._id);
            if (failureCount !== null && failureCount >= SWEEP_FAILURE_ALERT_THRESHOLD) {
                console.error(`${label}: round ${round._id} has failed sweep recovery ${failureCount} times in a row - needs investigation`, err);
            } else {
                console.error(`${label}: failed to recover stale round ${round._id}`, err);
            }
        }
    }
}

// Wires sweepStaleRounds into the once-a-minute background poll every game schedules at
// module load. `label` lets Slots prefix its log lines with `slots(${machine})` while still
// keying the DB sweep off the plain machine slug.
export function scheduleStaleRoundSweep(game: string, ttlMs: number, settle: (round: any) => Promise<void>, label: string = game): void {
    setInterval(() => {
        sweepStaleRounds(game, ttlMs, settle, label).catch((err: Error) => {
            console.error(`${label}: stale round recovery failed`, err);
        });
    }, 60 * 1000).unref();
}
