/**
 * Pachinko payout/economy constants. There's no weighted pocket table here (unlike Plinko's
 * plinkoOdds.ts, or this game's own first draft) - the outcome now comes from a real physics
 * simulation, not a pre-selected probability, so there's no closed-form RTP to derive.
 *
 * These are rough starting values, not tuned - the priority right now is a playable game;
 * balancing SIDE_TULIP_MULTIPLIER/CONTRIBUTION_RATE/catcher widths against real play data is
 * a deliberate later pass (see the plan doc).
 */

// "A handful of bonus balls," same flavor as a real side-tulip catch - a modest fixed
// multiple of the price paid per ball.
export const SIDE_TULIP_MULTIPLIER = 2;

// Fraction of every non-jackpot ball's price that feeds the shared jackpot pool, paid out
// when the primed center tulip is caught. Same shape Slots already uses for its own pool.
export const CONTRIBUTION_RATE = 0.5;

export const JACKPOT_SEED = 0;

export function sideTulipPayout(pricePerBall: number): number {
    return pricePerBall * SIDE_TULIP_MULTIPLIER;
}
