// Headline "1:X.XX" style odds badge instead of a raw RTP/house-edge percentage - still
// computed from each game's real, server-verified probability, just reformatted for
// display. Undefined probability (still loading, or not applicable) renders nothing.
export function formatOddsRatio(probability: number | undefined): string | undefined {
    if (probability === undefined || !Number.isFinite(probability) || probability <= 0) {
        return undefined;
    }
    return `1:${(1 / probability).toFixed(2)}`;
}
