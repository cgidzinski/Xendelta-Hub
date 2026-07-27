// Every game supplies its own maxPayout (see each game's config/constant) - this is just the
// shared clamp math, not a hardcoded ceiling, so games can carry different caps.
export function capPayout(payout: number, maxPayout: number): number {
    return Math.min(payout, maxPayout);
}
