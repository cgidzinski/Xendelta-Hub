const { XenCasinoUserState } = require("../models/xenCasino");
import { notify } from "./notificationUtils";

// Called once per successfully settled casino round (any game) - bumps today's "play N
// rounds" progress and, the moment it first crosses the target for the day, pushes a
// notification through the same channel every other in-app notification uses.
export async function recordCasinoRoundPlayed(userId: string): Promise<void> {
    const { status, justCompleted } = await XenCasinoUserState.recordRoundPlayed(userId);
    if (!justCompleted) {
        return;
    }
    await notify(
        userId,
        "Daily quest ready!",
        `You've played ${status.target} XenCasino rounds today - claim your reward.`,
        "/internal/xencasino",
        "casino"
    );
}
