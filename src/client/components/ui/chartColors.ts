// Validated categorical palette for XenBudget's charts and label chips.
//
// The app renders dark-only (createTheme({ palette: { mode: "dark" } }) in main.tsx), so
// only the dark steps are needed here.
//
// These values are NOT eyeballed. The previous palette — inherited from Xensplit's
// GroupAnalytics and reused here — fails colourblind separation: #e879f9 and #60a5fa sit
// ΔE 5.0 apart under protanopia, well under the ≥8 target, so a protan reader cannot tell
// those two series apart. This set passes every check on the adjacent pairlist against
// the dark surface: lightness band, chroma floor, CVD separation (worst adjacent ΔE 8.4),
// normal-vision separation (19.3) and ≥3:1 contrast.
//
// Xensplit's and the admin casino page's own copies are deliberately left alone; this is
// XenBudget's palette, not a global migration.
export const CHART_COLORS = [
    "#3987e5", // blue
    "#d95926", // orange
    "#199e70", // aqua
    "#c98500", // yellow
    "#d55181", // magenta
    "#008300", // green
    "#9085e9", // violet
    "#e66767", // red
] as const;

/**
 * The single hue for magnitude bars.
 *
 * Comparing "how much per category" is a magnitude job, not an identity one, so those bars
 * use one hue with the category named on the axis — rather than a colour per category,
 * which would have to cycle hues once a book has more than eight and would leave two
 * categories indistinguishable.
 */
export const MAGNITUDE_COLOR = "#3987e5";

/** Money out / money in, as a fixed two-series pairing. */
export const EXPENSE_COLOR = "#d95926";
export const INCOME_COLOR = "#199e70";

export function chartColorAt(index: number): string {
    return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Stable colour for a label (category or flag) with no explicitly assigned one. Hashing
 * the name (rather than using list position) keeps a label the same colour as others are
 * added and removed around it.
 *
 * For CHIPS only — every chip carries its own text label, so a hue repeating across a
 * long list costs nothing. Charts must not encode a series by this: past eight labels it
 * would reuse hues, and two different ones sharing a hue would be unreadable.
 */
export function colorForLabel(label: string): string {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = (hash * 31 + label.charCodeAt(i)) | 0;
    }
    return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
}
