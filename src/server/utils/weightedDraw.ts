/**
 * Generic weighted random pick - extracted from slots.ts's own `drawSymbol` so any other game
 * that needs "pick one of these, some more likely than others" (Pachinko's reel gimmick, see
 * pachinkoReels.ts) uses the exact same cryptographically-random draw slots.ts already relies
 * on, instead of a second hand-rolled copy of the same cumulative-weight loop.
 */
const crypto = require("crypto");

export interface WeightedOption<T> {
    value: T;
    weight: number;
}

export function drawWeighted<T>(options: WeightedOption<T>[]): T {
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    const roll = crypto.randomInt(0, total);
    let cumulative = 0;
    for (const { value, weight } of options) {
        cumulative += weight;
        if (roll < cumulative) {
            return value;
        }
    }
    return options[options.length - 1].value;
}
