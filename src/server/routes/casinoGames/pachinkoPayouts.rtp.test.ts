import { describe, it, expect } from "vitest";
import { simulateShot } from "./pachinkoPhysics";
import { MIN_LAUNCH_POWER, MAX_LAUNCH_POWER } from "./pachinkoLayout";
import { spinReel } from "./pachinkoReels";
import { BONUS_POCKET_BALLS, SIDE_TULIP_BALLS, REEL_TWO_MATCH_BALLS, REEL_THREE_MATCH_BALLS, ATTACKER_BALLS } from "./pachinkoPayouts";

// Monte Carlo RTP regression guard, same spirit as spinmaniaGrid.rtp.test.ts but WORST-CASE
// across launch power, not a blended average - launch power is a free, continuous, player-chosen
// input here (unlike a weighted symbol draw), so a blended-average RTP is meaningless: a rational
// player doesn't average across powers, they converge on whichever one performs best and fire
// there every time. This is what actually caught the real bug this test now guards against - an
// early tuning pass found the side tulip has a physics/nail-field sweet spot around launch power
// ~20-25 where it's caught 30-38% of the time (vs single digits almost everywhere else),
// producing a worst-case RTP as high as ~300% before the payout constants were re-tuned (see
// pachinkoPayoutTuning.ts, the full-precision version of this same measurement, for the real
// derivation and methodology this test's formula mirrors at a much smaller sample size).
//
// A much smaller grid/sample than the tuning script - this is a fast CI guard against a future
// constant edit reopening the hole, not a precise re-derivation.
const POWER_BUCKETS = 13;
const SHOTS_PER_BUCKET = 300;
const REEL_SPINS = 20_000;

function powerGrid(buckets: number): number[] {
    const grid: number[] = [];
    for (let i = 0; i < buckets; i++) {
        grid.push(MIN_LAUNCH_POWER + (i / (buckets - 1)) * (MAX_LAUNCH_POWER - MIN_LAUNCH_POWER));
    }
    return grid;
}

describe("pachinko worst-case RTP", () => {
    it("stays within a safe range across the full launch-power range - no power value lets a rational player beat the house long-run", () => {
        const reel = { two: 0, three: 0 };
        for (let i = 0; i < REEL_SPINS; i++) {
            const { matchTier } = spinReel();
            if (matchTier === "two") reel.two++;
            else if (matchTier === "three") reel.three++;
        }
        const pReelTwo = reel.two / REEL_SPINS;
        const pReelThree = reel.three / REEL_SPINS;

        let worstRtp = 0;
        let worstPower = 0;
        for (const power of powerGrid(POWER_BUCKETS)) {
            const counts: Record<string, number> = {};
            for (let i = 0; i < SHOTS_PER_BUCKET; i++) {
                const { outcome } = simulateShot(power);
                counts[outcome] = (counts[outcome] ?? 0) + 1;
            }
            const pAt = (o: string) => (counts[o] ?? 0) / SHOTS_PER_BUCKET;
            const pBonus = pAt("bonusLeft") + pAt("bonusRight");
            const pTulip = pAt("tulipLeft") + pAt("tulipRight");
            const pChucker = pAt("chucker");

            let attackerHits = 0;
            for (let i = 0; i < SHOTS_PER_BUCKET; i++) {
                const { outcome } = simulateShot(power, false, true, false);
                if (outcome === "attacker") attackerHits++;
            }
            const pAttackerCatchGivenOpen = attackerHits / SHOTS_PER_BUCKET;

            const rtp =
                pBonus * BONUS_POCKET_BALLS +
                pTulip * SIDE_TULIP_BALLS +
                pChucker * (pReelTwo * REEL_TWO_MATCH_BALLS + pReelThree * REEL_THREE_MATCH_BALLS) +
                pChucker * pReelThree * pAttackerCatchGivenOpen * ATTACKER_BALLS;

            if (rtp > worstRtp) {
                worstRtp = rtp;
                worstPower = power;
            }
        }

        // Wide tolerance - small sample per bucket and a coarse grid mean real noise, this is a
        // regression guard against a gross reopening of the exploit, not a precision check (see
        // pachinkoPayoutTuning.ts for the real, high-precision derivation). The upper bound is
        // the one that actually matters: it's what would have caught the original bug.
        expect(worstRtp, `worst-case RTP ${(worstRtp * 100).toFixed(1)}% at power=${worstPower.toFixed(1)} - a future constant edit may have reopened a power-specific exploit`).toBeLessThan(1.3);
        expect(worstRtp).toBeGreaterThan(0.2);
    }, 180000);
});
