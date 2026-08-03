// Shared "today / this week / all time" cutoff used by every XenCasino stats-style
// aggregation (admin stats, admin player-stats, the player-facing leaderboard) so the
// today/week boundary definition can't drift between them.
export type StatsRange = "today" | "week" | "all";

export function rangeCutoff(range: string): Date | null {
    var now = new Date();
    if (range === "today") {
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    } else if (range === "week") {
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * 24 * 60 * 60 * 1000);
    }
    return null;
}
