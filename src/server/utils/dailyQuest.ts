const { XenCasinoUserState, XenCasinoActivity } = require("../models/xenCasino");

export interface CasinoRoundActivity {
    game: string;
    wager: number;
    payout: number;
    jackpot?: boolean;
}

// Called once per successfully settled casino round (any game) - bumps today's "play N
// rounds" progress and records the round's money movement for admin stats (see
// XenCasinoActivity in xenCasino.js and src/server/routes/admin/casino.ts, which aggregates
// over these rows instead of the external Weeabets ledger). No notification is sent for the
// quest itself - the quest card on the casino page is prominent enough.
export async function recordCasinoRoundPlayed(userId: string, activity: CasinoRoundActivity): Promise<void> {
    await XenCasinoUserState.recordRoundPlayed(userId);
    await XenCasinoActivity.record({ userId, ...activity });
}
