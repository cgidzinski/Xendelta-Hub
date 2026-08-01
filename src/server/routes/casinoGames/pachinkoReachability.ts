/**
 * Pachinko board reachability sweep - the companion to pachinkoPayoutTuning.ts.
 *
 * Where the tuning script answers "what should the payouts be", this one answers "can the player
 * actually GET there". They're different questions, and this board has repeatedly been wrong on
 * the second one in ways the first can't see: a pocket that is never reached contributes nothing
 * to RTP, so a tuned board can still be a badly broken one.
 *
 * Two failure modes it exists to catch, both of which were live on this board and both of which
 * were invisible until measured:
 *
 *   - **Dead launch-power bands.** Powers 50-100 - half the slider - once scored *nothing at all*:
 *     the ball arced over the whole nail field and slid down the bare left glass into the gutter
 *     every single time. Any band where nothing scores is a chunk of the player's only control
 *     that does nothing.
 *   - **A jackpot that can't be primed.** Priming needs BOTH tulips open at once, and they TOGGLE,
 *     so what matters is not the total tulip rate but `min(left, right)` at a SINGLE power - a
 *     power that hits one side ten times more than the other doesn't help, it just flips the same
 *     tulip open and shut. The board once had `min(L,R)` above 5% at exactly one launch power.
 *   - **Balls wedging against the glass.** The structure added to fix the first item introduced
 *     this: a pin line running parallel to the wall at a gap fractionally narrower than the ball,
 *     which stops the ball as intended but by squeezing it rather than deflecting it. Up to 48% of
 *     shots at some powers came to a dead stop. See STILL_PX_PER_SAMPLE for why flight duration
 *     cannot see this and what does.
 *
 * Run it after ANY change to board geometry (pachinkoLayout.ts) or the launch curve, before
 * re-running the tuning script - a geometry change that fixes RTP while killing reachability is a
 * regression this is the only thing that will report.
 *
 *   npx tsx src/server/routes/casinoGames/pachinkoReachability.ts [buckets] [shotsPerBucket]
 *
 * Gate flags are held at chucker-open / attacker-closed / jackpot-closed, the state a player is in
 * for the overwhelming majority of shots. Jackpot reachability is reported separately with its own
 * gate forced open, since it is otherwise unobservable.
 */
import { simulateShot, PachinkoOutcome } from "../../../shared/pachinko/pachinkoPhysics";
import { mulberry32 } from "../../../shared/pachinko/prng";
import { MIN_LAUNCH_POWER, MAX_LAUNCH_POWER } from "../../../shared/pachinko/pachinkoLayout";

const BUCKETS = Number(process.argv[2]) || 21;
const SHOTS = Number(process.argv[3]) || 200;

// A band this wide scoring below DEAD_ZONE_SCORING_RATE is a real dead zone, not sampling noise.
// Deliberately a rate rather than "exactly zero": a band where one ball in 150 clips a bonus
// pocket is dead in every sense the player cares about, and testing for zero lets it pass.
const DEAD_ZONE_MIN_BUCKETS = 2;
const DEAD_ZONE_SCORING_RATE = 0.04;
// Per-bucket rate on the WEAKER tulip that counts as "the jackpot is primeable at this power".
const HEALTHY_MIN_TULIP_RATE = 0.025;

// --- Stuck-ball detection -------------------------------------------------------------------
// A ball that jams between a pin and the glass is the one board failure that flight DURATION
// cannot see: simulateShot's own stall detector gives up on a stationary ball after ~333ms and
// glides it to the drain, so a wedged shot reports a perfectly ordinary trajectory length. (When
// this was first measured the wrong way, only 0.1% of shots looked long, while a third of
// high-power shots were actually jamming.) What does show it is the ball's own MOTION: a run of
// consecutive samples where it barely moves.
const STILL_PX_PER_SAMPLE = 1.2; // below this, the ball is not meaningfully moving
const STILL_RUN_SAMPLES = 4; // 4 samples ~= 133ms of sitting still
// Stalls are reported split by whether they happen against the left glass, because that is where
// the left-field structure lives and where a geometry regression would show up first.
//
// Two things to know before acting on these numbers. First, the overall `stuck` column is NOT all
// wedges - a ball momentarily balancing on top of a pin is common everywhere on the board (there's a
// long-standing cluster on the release deflector around (297,113) at low power), and the great
// majority of stalls recover and fly on rather than parking. Only 0.1% of shots ever end stationary.
// Second, this corridor test is a plain x threshold, so it also picks up those mid-field balances
// that merely happen to be on the left; a couple of percent is the floor, not a wedge. What a real
// wedge looks like is a large rate concentrated at one or two sites - when this was last broken, 72
// stalls sat on a single pin. If a power fails here, find WHERE before changing any geometry.
const LEFT_CORRIDOR_X = 115;
const STUCK_RATE_FAIL = 0.05;

type Counts = Partial<Record<PachinkoOutcome, number>>;

function powerGrid(buckets: number): number[] {
    if (buckets <= 1) return [MAX_LAUNCH_POWER / 2];
    return Array.from({ length: buckets }, (_, i) => MIN_LAUNCH_POWER + (i * (MAX_LAUNCH_POWER - MIN_LAUNCH_POWER)) / (buckets - 1));
}

function sweep(power: number, shots: number, jackpotActive: boolean): Counts & { stuck?: number; stuckLeft?: number } {
    const counts: Counts & { stuck?: number; stuckLeft?: number } = {};
    let stuck = 0;
    let stuckLeft = 0;
    for (let i = 0; i < shots; i++) {
        // Seeded and power-offset so every bucket draws its own independent stream while the whole
        // sweep stays reproducible run to run - a reachability number that moves when nothing
        // changed is worse than useless for deciding whether a geometry edit helped.
        const { outcome, trajectory } = simulateShot(power, true, false, jackpotActive, mulberry32(((power * 7919) | 0) + i));
        counts[outcome] = (counts[outcome] ?? 0) + 1;

        // Longest run of near-stationary samples - see STILL_PX_PER_SAMPLE's own comment.
        let run = 0;
        let best = 0;
        let bestAt = -1;
        for (let k = 1; k < trajectory.length; k++) {
            const moved = Math.hypot(trajectory[k].x - trajectory[k - 1].x, trajectory[k].y - trajectory[k - 1].y);
            if (moved < STILL_PX_PER_SAMPLE) {
                run++;
                if (run > best) {
                    best = run;
                    bestAt = k;
                }
            } else {
                run = 0;
            }
        }
        if (best >= STILL_RUN_SAMPLES) {
            stuck++;
            if (trajectory[bestAt].x < LEFT_CORRIDOR_X) stuckLeft++;
        }
    }
    counts.stuck = stuck;
    counts.stuckLeft = stuckLeft;
    return counts;
}

function pct(n: number, total: number): string {
    return `${((n / total) * 100).toFixed(1)}%`.padStart(6);
}

function main() {
    const powers = powerGrid(BUCKETS);
    console.log(`Pachinko reachability sweep - ${BUCKETS} power buckets x ${SHOTS} shots across [${MIN_LAUNCH_POWER}, ${MAX_LAUNCH_POWER}]`);
    console.log("Gates: chucker open, attacker closed (the common case). Jackpot measured separately.\n");

    const rows = powers.map((power) => {
        const c = sweep(power, SHOTS, false);
        const tulipL = c.tulipLeft ?? 0;
        const tulipR = c.tulipRight ?? 0;
        const scoring = SHOTS - (c.gutter ?? 0);
        return {
            power,
            tulipL,
            tulipR,
            minTulip: Math.min(tulipL, tulipR),
            bonus: (c.bonusLeft ?? 0) + (c.bonusRight ?? 0),
            chucker: c.chucker ?? 0,
            scoring,
            stuck: c.stuck ?? 0,
            stuckLeft: c.stuckLeft ?? 0,
        };
    });

    console.log("power |  tulipL  tulipR | min(L,R) |   bonus  chucker |  scoring |  stuck  (left)");
    console.log("------+-----------------+----------+------------------+----------+---------------");
    for (const r of rows) {
        const flag = r.scoring / SHOTS < DEAD_ZONE_SCORING_RATE ? "  <- DEAD" : r.stuckLeft / SHOTS >= STUCK_RATE_FAIL ? "  <- STUCK" : r.minTulip / SHOTS >= HEALTHY_MIN_TULIP_RATE ? "  <- both tulips" : "";
        console.log(
            `${r.power.toFixed(0).padStart(5)} | ${pct(r.tulipL, SHOTS)}  ${pct(r.tulipR, SHOTS)} | ${pct(r.minTulip, SHOTS)}   | ${pct(r.bonus, SHOTS)}   ${pct(r.chucker, SHOTS)} | ${pct(r.scoring, SHOTS)}  | ${pct(r.stuck, SHOTS)} ${pct(r.stuckLeft, SHOTS)}${flag}`
        );
    }

    // --- Dead zones -------------------------------------------------------------------------
    console.log("\n--- Dead zones (power bands where nothing scores at all) ---");
    const deadRuns: Array<{ from: number; to: number; buckets: number }> = [];
    let run: { from: number; to: number; buckets: number } | null = null;
    for (const r of rows) {
        if (r.scoring / SHOTS < DEAD_ZONE_SCORING_RATE) {
            run = run ? { from: run.from, to: r.power, buckets: run.buckets + 1 } : { from: r.power, to: r.power, buckets: 1 };
        } else if (run) {
            deadRuns.push(run);
            run = null;
        }
    }
    if (run) deadRuns.push(run);

    const realDeadZones = deadRuns.filter((d) => d.buckets >= DEAD_ZONE_MIN_BUCKETS);
    if (realDeadZones.length === 0) {
        console.log("  none - every launch power scores meaningfully. PASS");
    } else {
        for (const d of realDeadZones) {
            const span = ((d.buckets / BUCKETS) * 100).toFixed(0);
            console.log(`  power ${d.from.toFixed(0)}-${d.to.toFixed(0)}: scores essentially nothing (${d.buckets} buckets, ${span}% of the slider). FAIL`);
        }
    }

    // --- Stuck balls --------------------------------------------------------------------------
    console.log("\n--- Stuck balls (near-stationary runs; 'left' = against the left glass) ---");
    console.log("Flight duration cannot see this - the stall detector cuts a jammed ball short and");
    console.log("glides it to the drain, so a wedge reports an ordinary-length trajectory.");
    const worstStuck = rows.reduce((a, b) => (b.stuckLeft > a.stuckLeft ? b : a));
    const badStuck = rows.filter((r) => r.stuckLeft / SHOTS >= STUCK_RATE_FAIL);
    console.log(`  worst power for left-glass stalls: ${worstStuck.power.toFixed(0)} - ${pct(worstStuck.stuckLeft, SHOTS).trim()} of shots`);
    if (badStuck.length === 0) {
        console.log(`  no power band stalls against the left glass above ${(STUCK_RATE_FAIL * 100).toFixed(0)}%. PASS`);
    } else {
        console.log(`  ${badStuck.length} power(s) stall against the left glass above ${(STUCK_RATE_FAIL * 100).toFixed(0)}%: ${badStuck.map((r) => r.power.toFixed(0)).join(", ")}. FAIL`);
    }

    // --- Jackpot primeability ---------------------------------------------------------------
    console.log("\n--- Jackpot primeability ---");
    console.log("Priming needs BOTH tulips open at once, and they toggle - so what matters is the");
    console.log("WEAKER side at a single power, not the total. A power that only feeds one tulip");
    console.log("just opens and closes it.");
    const healthy = rows.filter((r) => r.minTulip / SHOTS >= HEALTHY_MIN_TULIP_RATE);
    const best = rows.reduce((a, b) => (b.minTulip > a.minTulip ? b : a));
    console.log(`  best power: ${best.power.toFixed(0)} - min(L,R) = ${pct(best.minTulip, SHOTS).trim()} (L ${pct(best.tulipL, SHOTS).trim()}, R ${pct(best.tulipR, SHOTS).trim()})`);
    console.log(`  powers at or above ${(HEALTHY_MIN_TULIP_RATE * 100).toFixed(1)}% on the weaker side: ${healthy.length ? healthy.map((r) => r.power.toFixed(0)).join(", ") : "NONE"}`);
    if (healthy.length >= 3) {
        console.log("  a usable band exists. PASS");
    } else {
        console.log(`  only ${healthy.length} power(s) can realistically prime the jackpot. FAIL - the player has essentially one setting.`);
    }

    // --- Jackpot pocket itself --------------------------------------------------------------
    // Measured with its gate forced open, since it is otherwise never reachable and would report
    // as flatly unreachable regardless of geometry.
    console.log("\n--- Jackpot pocket reach (gate forced open) ---");
    let jackpotTotal = 0;
    for (const power of powers) {
        const c = sweep(power, SHOTS, true);
        jackpotTotal += c.jackpot ?? 0;
    }
    const jackpotShots = powers.length * SHOTS;
    console.log(`  ${jackpotTotal}/${jackpotShots} = ${pct(jackpotTotal, jackpotShots).trim()} across the whole power range`);
    if (jackpotTotal === 0) {
        console.log("  the jackpot pocket is physically unreachable at every power. FAIL");
    }
}

main();
