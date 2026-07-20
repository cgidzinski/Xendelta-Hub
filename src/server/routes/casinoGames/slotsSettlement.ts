/**
 * Shared money-moving settlement for every slot machine (Easy Spin's 3-reel engine and
 * SpinMania's 5x3 cascading grid alike) - the one deliberate point of code sharing between
 * the two otherwise-forked engines (see slots.ts and spinmania.ts's own header comments for
 * why the game-shape logic itself is NOT shared). This helper only ever reads an
 * already-decided `{ wager, playerAccountId, payout, jackpot }` off a round - it has zero
 * opinion about reel count, paylines, or cascades, so it's safe for both engines to depend on
 * without recoupling them.
 *
 * Pays out the round's already-decided payout (if any) and updates that machine's own
 * jackpot pool. Shared by each engine's live spin handler and its own recovery sweep so both
 * settle a round exactly the same way.
 */
const { XenCasino } = require("../../models/xenCasino");
import { getXenCasinoAccountId, transfer } from "../../utils/weeabetsClient";

export interface SettleableRound {
    _id: string;
    wager: number;
    playerAccountId: number;
}

export interface SettleableConditions {
    jackpot: boolean;
    payout: number;
}

export async function settleSlotsRound(
    machineSlug: string,
    jackpotContributionRate: number,
    jackpotSeed: number,
    round: SettleableRound,
    conditions: SettleableConditions
): Promise<{ balance?: string }> {
    const { jackpot, payout } = conditions;

    let balance: string | undefined;
    if (payout > 0) {
        const xenCasinoAccountId = await getXenCasinoAccountId();
        const result = await transfer({
            fromAccountId: xenCasinoAccountId,
            toAccountId: round.playerAccountId,
            amount: payout.toFixed(10),
            key: `xendelta-slots-${machineSlug}-payout-${round._id}`,
            note: jackpot ? `${machineSlug}_jackpot` : `${machineSlug}_win`,
        });
        balance = result.toNewBalance;
    }

    if (jackpot) {
        await XenCasino.resetJackpotPool(machineSlug, jackpotSeed);
    } else {
        await XenCasino.incrementJackpotPool(machineSlug, round.wager * jackpotContributionRate);
    }

    return { balance };
}
