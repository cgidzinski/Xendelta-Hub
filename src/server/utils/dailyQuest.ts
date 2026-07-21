const { XenCasinoUserState } = require("../models/xenCasino");

// Called once per successfully settled casino round (any game) - bumps today's "play N
// rounds" progress. No notification is sent - the quest card on the casino page itself is
// prominent enough.
export async function recordCasinoRoundPlayed(userId: string): Promise<void> {
    await XenCasinoUserState.recordRoundPlayed(userId);
}
