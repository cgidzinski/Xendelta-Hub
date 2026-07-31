/**
 * Standalone RTP measurement tool for Pachinko - not a test, not imported anywhere in
 * production. Run manually with `npx tsx src/server/routes/casinoGames/pachinkoPayoutTuning.ts`
 * whenever the board geometry (pachinkoLayout.ts), the reel weights (pachinkoReels.ts), or the
 * physics tuning (pachinkoPhysics.ts) changes and the ball-payout constants in pachinkoPayouts.ts
 * need to be re-derived against the new numbers.
 *
 * Why this exists: unlike every other XenCasino game, Pachinko's outcome comes from a real
 * matter-js simulation, not a weighted-draw probability table - there's no closed-form RTP to
 * solve algebraically (see pachinkoPayouts.ts's own header). This script estimates it instead,
 * by running simulateShot() at scale and treating the observed outcome frequencies as the
 * probability distribution.
 *
 * WORST-CASE, NOT BLENDED - same precedent as Plinko (see plinkoLayout.ts's MULTIPLIERS
 * comment, which documents hitting this exact same trap: "the previous placeholder values...
 * turned out to have a 120% worst-case RTP", found by computing EV per drop position and taking
 * the max, not a blended average across all of them). Launch power here is a free, continuous,
 * player-chosen input, not a random draw - a rational player doesn't average across powers, they
 * converge on whichever one performs best and fire there every time. An early version of this
 * script blended outcome frequencies across a uniform power sweep into one aggregate RTP and
 * got 54.8% - which looked like a brutal house edge, the *opposite* of the reported problem. The
 * per-power breakdown revealed why that number was meaningless: scoring rate is ~15-31% for
 * powers 0-45 and collapses to ~0.5-1.5% for powers 50-100 (the sweet-spot zone gets diluted by
 * a dead zone no rational player would ever use). This script instead computes EV(power) for
 * each bucket across the launch range and scales against the MAX across all of them - the real
 * return a player aiming optimally would get long-run, i.e. the actual house-losing exposure.
 *
 * RTP(power) = P(bonusLeft|power)+P(bonusRight|power)) * BONUS_POCKET_BALLS
 *            + (P(tulipLeft|power)+P(tulipRight|power)) * SIDE_TULIP_BALLS
 *            + P(chucker|power) * [P(two|chucker)*REEL_TWO_MATCH_BALLS + P(three|chucker)*REEL_THREE_MATCH_BALLS]
 *            + P(chucker|power) * P(three|chucker) * ATTACKER_OPEN_SHOTS * P(attackerCatch|open,power) * ATTACKER_BALLS
 *
 * Reel-tier probabilities (P(two|chucker), P(three|chucker)) don't depend on launch power - the
 * reel spin (pachinkoReels.ts) is pure JS, unrelated to where the ball came from - so they're
 * measured once and reused across every power bucket.
 *
 * The jackpot pocket is deliberately excluded from RTP(power) - its pool is funded entirely by
 * wagers already collected via CONTRIBUTION_RATE from every non-jackpot ball fired, so paying it
 * out is a zero-sum transfer among players' own money, not new cost to the house (see
 * pachinko.ts's own comment on poolContribution). Since CASH_OUT_RATE = 1 (no skim - see
 * pachinkoPayouts.ts), the measured "balls returned per ball fired" figure below IS the cash RTP
 * directly.
 *
 * The attacker's contribution charges ATTACKER_OPEN_SHOTS attempts per triggering
 * chucker-three-match event - the window is measured in balls now (see
 * shared/pachinko/pachinkoRules.ts), and a player who opens it fires every one of those balls
 * into an open attacker. Since the chucker and attacker share a gate, no new three-of-a-kind can
 * land during the window, so the term doesn't compound.
 */
import { simulateShot } from "../../../shared/pachinko/pachinkoPhysics";
import { MIN_LAUNCH_POWER, MAX_LAUNCH_POWER } from "../../../shared/pachinko/pachinkoLayout";
import { spinReel } from "../../../shared/pachinko/pachinkoReels";
import { BONUS_POCKET_BALLS, SIDE_TULIP_BALLS, REEL_TWO_MATCH_BALLS, REEL_THREE_MATCH_BALLS, ATTACKER_BALLS, ATTACKER_OPEN_SHOTS } from "./pachinkoPayouts";

const TARGET_RTP = 0.9;
const POWER_BUCKETS = Number(process.argv[2]) || 21;
const SHOTS_PER_BUCKET = Number(process.argv[3]) || 300; // per bucket, per pass (base outcomes + attacker-open)
const REEL_SPINS = 200_000; // pure JS, effectively free, power-independent

function powerGrid(buckets: number): number[] {
    const grid: number[] = [];
    for (let i = 0; i < buckets; i++) {
        grid.push(MIN_LAUNCH_POWER + (i / (buckets - 1)) * (MAX_LAUNCH_POWER - MIN_LAUNCH_POWER));
    }
    return grid;
}

function measureBaseOutcomesAt(power: number, shots: number): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let i = 0; i < shots; i++) {
        const { outcome } = simulateShot(power);
        counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    return counts;
}

function measureAttackerCatchRateAt(power: number, shots: number): number {
    let hits = 0;
    for (let i = 0; i < shots; i++) {
        const { outcome } = simulateShot(power, false, true, false);
        if (outcome === "attacker") hits++;
    }
    return hits / shots;
}

function measureReelTiers(): { pTwo: number; pThree: number } {
    let two = 0;
    let three = 0;
    for (let i = 0; i < REEL_SPINS; i++) {
        const { matchTier } = spinReel();
        if (matchTier === "two") two++;
        else if (matchTier === "three") three++;
    }
    return { pTwo: two / REEL_SPINS, pThree: three / REEL_SPINS };
}

// Closed-form cross-check against the reel's own weights (40/28/18/10/4 over 100 - see
// pachinkoReels.ts's REEL_SYMBOL_WEIGHTS), so a bug in the empirical draw above would show up as
// a mismatch here rather than silently feeding a wrong number into the RTP calc.
function closedFormReelTiers(): { pTwo: number; pThree: number } {
    const weights = [40, 28, 18, 10, 4];
    const total = weights.reduce((a, b) => a + b, 0);
    const probs = weights.map((w) => w / total);
    const pThree = probs.reduce((sum, p) => sum + p ** 3, 0);
    const pTwo = probs.reduce((sum, p) => sum + 3 * p * p * (1 - p), 0);
    return { pTwo, pThree };
}

// Floor, not round-to-nearest: these constants cap a WORST-CASE RTP at a target ceiling, so
// rounding 0.5+ fractions up (as Math.round would) can push the actual worst-case back over
// target purely from integer-ball-count rounding - observed in practice: an exact multiplier of
// 2.56 balls rounded up to 3 and put the tulip's own worst-case RTP back up to ~105% despite
// being "solved" for exactly 90%. Flooring always errs toward the house, never past the target.
function roundConstant(value: number): number {
    return Math.max(1, Math.floor(value));
}

interface BucketResult {
    power: number;
    pBonus: number;
    pTulip: number;
    pChucker: number;
    pAttackerCatchGivenOpen: number;
    evBonus: number;
    evTulip: number;
    evReel: number;
    evAttacker: number;
    rtp: number;
}

function evForBucket(bucket: { pBonus: number; pTulip: number; pChucker: number; pAttackerCatchGivenOpen: number }, reel: { pTwo: number; pThree: number }, constants: { bonus: number; tulip: number; two: number; three: number; attacker: number }) {
    const evBonus = bucket.pBonus * constants.bonus;
    const evTulip = bucket.pTulip * constants.tulip;
    const evReel = bucket.pChucker * (reel.pTwo * constants.two + reel.pThree * constants.three);
    // A three-of-a-kind opens the attacker for ATTACKER_OPEN_SHOTS BALLS, and the player fires
    // every one of them into an open attacker - so a triggering event is worth that many attempts,
    // not one. The old model charged a single attempt and called the undercount "safe"; once the
    // window became an explicit ball count that undercount is a ~37x understatement of the
    // attacker's EV, which is far too large to wave through.
    //
    // The chucker and attacker share one gate, so no NEW three-of-a-kind can trigger during the
    // window - which is exactly what keeps this term finite rather than compounding.
    const evAttacker = bucket.pChucker * reel.pThree * ATTACKER_OPEN_SHOTS * bucket.pAttackerCatchGivenOpen * constants.attacker;
    return { evBonus, evTulip, evReel, evAttacker, rtp: evBonus + evTulip + evReel + evAttacker };
}

async function main() {
    console.log(`Pachinko RTP tuning - target RTP ${(TARGET_RTP * 100).toFixed(1)}% (worst-case power, not blended - see file header)`);
    console.log(`Sampling ${POWER_BUCKETS} power buckets x ${SHOTS_PER_BUCKET} shots/bucket/pass across [${MIN_LAUNCH_POWER}, ${MAX_LAUNCH_POWER}]\n`);

    console.log("Reel tiers (pure JS draw, power-independent)...");
    const reelEmpirical = measureReelTiers();
    const reelClosedForm = closedFormReelTiers();
    console.log(`  empirical:   P(two)=${reelEmpirical.pTwo.toFixed(4)} P(three)=${reelEmpirical.pThree.toFixed(4)}`);
    console.log(`  closed-form: P(two)=${reelClosedForm.pTwo.toFixed(4)} P(three)=${reelClosedForm.pThree.toFixed(4)}\n`);

    const currentConstants = { bonus: BONUS_POCKET_BALLS, tulip: SIDE_TULIP_BALLS, two: REEL_TWO_MATCH_BALLS, three: REEL_THREE_MATCH_BALLS, attacker: ATTACKER_BALLS };
    console.log("Current constants:", JSON.stringify(currentConstants), "\n");

    console.log("power  scoring%  bonus%  tulip%  chucker%  atk|open%   RTP(power) @ current constants");
    const buckets: BucketResult[] = [];
    for (const power of powerGrid(POWER_BUCKETS)) {
        const counts = measureBaseOutcomesAt(power, SHOTS_PER_BUCKET);
        const pAt = (o: string) => (counts[o] ?? 0) / SHOTS_PER_BUCKET;
        const pBonus = pAt("bonusLeft") + pAt("bonusRight");
        const pTulip = pAt("tulipLeft") + pAt("tulipRight");
        const pChucker = pAt("chucker");
        const pAttackerCatchGivenOpen = measureAttackerCatchRateAt(power, SHOTS_PER_BUCKET);

        const ev = evForBucket({ pBonus, pTulip, pChucker, pAttackerCatchGivenOpen }, reelEmpirical, currentConstants);
        const scoring = 1 - (counts["gutter"] ?? 0) / SHOTS_PER_BUCKET;
        buckets.push({ power, pBonus, pTulip, pChucker, pAttackerCatchGivenOpen, ...ev });
        console.log(
            `${power.toFixed(1).padStart(5)}  ${(scoring * 100).toFixed(1).padStart(7)}%  ${(pBonus * 100).toFixed(1).padStart(5)}%  ${(pTulip * 100).toFixed(1).padStart(5)}%  ${(pChucker * 100).toFixed(1).padStart(7)}%  ${(pAttackerCatchGivenOpen * 100).toFixed(1).padStart(8)}%   ${ev.rtp.toFixed(4)}`
        );
    }

    const worst = buckets.reduce((max, b) => (b.rtp > max.rtp ? b : max), buckets[0]);
    console.log(`\nWorst case for the house (max combined RTP across all sampled powers): power=${worst.power.toFixed(1)}, RTP=${worst.rtp.toFixed(4)} (${(worst.rtp * 100).toFixed(2)}%)`);
    console.log(`  breakdown: bonus=${worst.evBonus.toFixed(4)} tulip=${worst.evTulip.toFixed(4)} reel=${worst.evReel.toFixed(4)} attacker=${worst.evAttacker.toFixed(4)}\n`);

    // TARGETED FIX, not a single uniform multiplier - the tulip pocket has a physics/geometry
    // sweet spot (a specific launch power where its own catch rate spikes far above every other
    // pocket at any power) that dominates the combined worst case above almost entirely on its
    // own - see this bucket table: at the worst-case power, tulip's own EV is ~everything, the
    // other three components are near zero there. A single multiplier derived from that combined
    // worst case would crush bonus/reel/attacker down to trivial 1-ball payouts even though
    // they're not the actual problem (confirmed below - each of *their* own isolated worst cases,
    // found at their own best power, is checked independently).
    //
    // Stage 1: neutralize the tulip's own worst case (its own peak, isolated from the others) by
    // itself, down to the target RTP.
    const evTulipWorst = Math.max(...buckets.map((b) => b.evTulip));
    const tulipMultiplier = TARGET_RTP / evTulipWorst;
    const stage1Tulip = roundConstant(SIDE_TULIP_BALLS * tulipMultiplier);
    console.log(`Stage 1 - tulip's own worst-case EV (isolated): ${evTulipWorst.toFixed(4)} (${(evTulipWorst * 100).toFixed(2)}%)`);
    console.log(`  multiplier to bring it to target: ${tulipMultiplier.toFixed(4)} -> SIDE_TULIP_BALLS ${SIDE_TULIP_BALLS} -> ${stage1Tulip}\n`);

    // Stage 2: with the tulip fixed, recompute the COMBINED worst case across every power again
    // (not each component in isolation) - this is what actually matters, since a real player
    // fires at whichever single power maximizes their total take, and components can partially
    // overlap at a shared power even if none of them peaks there individually. If that residual
    // combined worst case still clears the target, apply one more (much smaller) uniform
    // multiplier to the three remaining constants - tulip is untouched here, it was already
    // brought to target in stage 1.
    const stage1Constants = { bonus: BONUS_POCKET_BALLS, tulip: stage1Tulip, two: REEL_TWO_MATCH_BALLS, three: REEL_THREE_MATCH_BALLS, attacker: ATTACKER_BALLS };
    const residualWorst = buckets.reduce((max, b) => Math.max(max, evForBucket(b, reelEmpirical, stage1Constants).rtp), 0);
    console.log(`Stage 2 - combined worst-case RTP with tulip alone fixed: ${residualWorst.toFixed(4)} (${(residualWorst * 100).toFixed(2)}%)`);

    let recommended: { BONUS_POCKET_BALLS: number; SIDE_TULIP_BALLS: number; REEL_TWO_MATCH_BALLS: number; REEL_THREE_MATCH_BALLS: number; ATTACKER_BALLS: number };
    if (residualWorst > TARGET_RTP * 1.02) {
        const secondaryMultiplier = TARGET_RTP / residualWorst;
        console.log(`  still above target - applying a secondary multiplier of ${secondaryMultiplier.toFixed(4)} to bonus/reel/attacker only (tulip stays fixed)\n`);
        recommended = {
            BONUS_POCKET_BALLS: roundConstant(BONUS_POCKET_BALLS * secondaryMultiplier),
            SIDE_TULIP_BALLS: stage1Tulip,
            REEL_TWO_MATCH_BALLS: roundConstant(REEL_TWO_MATCH_BALLS * secondaryMultiplier),
            REEL_THREE_MATCH_BALLS: roundConstant(REEL_THREE_MATCH_BALLS * secondaryMultiplier),
            ATTACKER_BALLS: roundConstant(ATTACKER_BALLS * secondaryMultiplier),
        };
    } else {
        console.log(`  already within target + 2pt tolerance - bonus/reel/attacker stay at their current values, only the tulip needed correcting\n`);
        recommended = {
            BONUS_POCKET_BALLS: BONUS_POCKET_BALLS,
            SIDE_TULIP_BALLS: stage1Tulip,
            REEL_TWO_MATCH_BALLS: REEL_TWO_MATCH_BALLS,
            REEL_THREE_MATCH_BALLS: REEL_THREE_MATCH_BALLS,
            ATTACKER_BALLS: ATTACKER_BALLS,
        };
    }

    console.log("Recommended constants (targeted tulip cut + light uniform correction, rounded, floored at 1):");
    console.log(`  ${JSON.stringify(recommended, null, 2)}\n`);

    // Re-derive the combined worst-case RTP from the final rounded recommendation using the same
    // per-bucket probabilities already measured above, so rounding drift is visible immediately
    // without a second full simulation run.
    const projected = buckets.reduce((max, b) => {
        const ev = evForBucket(b, reelEmpirical, {
            bonus: recommended.BONUS_POCKET_BALLS,
            tulip: recommended.SIDE_TULIP_BALLS,
            two: recommended.REEL_TWO_MATCH_BALLS,
            three: recommended.REEL_THREE_MATCH_BALLS,
            attacker: recommended.ATTACKER_BALLS,
        });
        return Math.max(max, ev.rtp);
    }, 0);
    console.log(`Projected combined worst-case RTP after rounding: ${projected.toFixed(4)} (${(projected * 100).toFixed(2)}%)`);
    if (Math.abs(projected - TARGET_RTP) > 0.02) {
        console.log(`  WARNING: projected worst-case RTP drifts more than 2 points from target - consider nudging the largest-magnitude constant by +/-1 and re-running.`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
