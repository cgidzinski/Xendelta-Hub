/**
 * The board's central digital reel gimmick - triggered by a chucker catch, mirroring how a real
 * modern machine's "heso" (start chucker) fires its own LCD reel spin, which is what modern
 * boards actually put in the middle of the field (see the photo research this board's own nail
 * field was rebuilt from). Reuses the Slots engine's own generic weighted-draw (weightedDraw.ts)
 * and its ITEM_A/ITEM_B/.../JACKPOT_ITEM symbol-key vocabulary (slots.ts), so XenCasino has one
 * consistent reel-symbol language instead of a second one invented just for this board - the
 * frontend still owns 100% of what each key actually looks like, same as every slots machine.
 *
 * Unlike slots.ts, this isn't its own wagered game with an RTP to solve - it's a small bonus
 * layered onto the chucker's existing, already-simulated-physics economy (see pachinkoPayouts.ts's
 * own header on why this board doesn't do closed-form RTP), so the weights and bonus sizes are
 * deliberately modest starting values, not solved for a target return.
 */
import { drawWeighted } from "../../utils/weightedDraw";
import { REEL_TWO_MATCH_BALLS, REEL_THREE_MATCH_BALLS, REEL_THREE_MATCH_BONUS_MS } from "./pachinkoPayouts";

export type ReelSymbol = string;
export type ReelMatchTier = "none" | "two" | "three";

export interface ReelSpinResult {
    symbols: [ReelSymbol, ReelSymbol, ReelSymbol];
    matchTier: ReelMatchTier;
    ballsAwarded: number;
    attackerBonusMs: number;
}

const REEL_SYMBOL_WEIGHTS = [
    { value: "ITEM_A", weight: 40 },
    { value: "ITEM_B", weight: 28 },
    { value: "ITEM_C", weight: 18 },
    { value: "ITEM_D", weight: 10 },
    { value: "JACKPOT_ITEM", weight: 4 },
];

function drawReelSymbol(): ReelSymbol {
    return drawWeighted(REEL_SYMBOL_WEIGHTS);
}

// Any two matching (regardless of which symbol) is "two" - simpler than slots.ts's own
// MINOR_ITEM-specific two-of-a-kind rule, since this reel doesn't need a full paytable per
// symbol, just three tiers to feed into the chucker's own ball economy.
export function reelMatchTier(symbols: [ReelSymbol, ReelSymbol, ReelSymbol]): ReelMatchTier {
    const [a, b, c] = symbols;
    if (a === b && b === c) return "three";
    if (a === b || b === c || a === c) return "two";
    return "none";
}

export function spinReel(): ReelSpinResult {
    const symbols: [ReelSymbol, ReelSymbol, ReelSymbol] = [drawReelSymbol(), drawReelSymbol(), drawReelSymbol()];
    const matchTier = reelMatchTier(symbols);
    return {
        symbols,
        matchTier,
        ballsAwarded: matchTier === "three" ? REEL_THREE_MATCH_BALLS : matchTier === "two" ? REEL_TWO_MATCH_BALLS : 0,
        attackerBonusMs: matchTier === "three" ? REEL_THREE_MATCH_BONUS_MS : 0,
    };
}
