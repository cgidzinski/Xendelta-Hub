/**
 * Which nav entry a URL is on.
 *
 * Extracted and tested because it is the one thing here that fails *silently*: get it
 * wrong and the tab bar simply shows nothing selected, with no error to notice.
 */

/**
 * Top-level tabs, in the order they render.
 *
 * Savings goals are deliberately NOT here. They are reached from a button on the Overview
 * instead: a fifth tab crowded the bar (on a phone the labels drop to icons alone), and
 * goals are somewhere you go now and then rather than one of the views you switch between.
 * /goals is still a real route, so it deep-links and the back button works — it just
 * leaves no tab selected. The bar is still rendered above it, so any tab is a way out.
 */
export const TAB_PATHS = ["overview", "items", "report", "settings"] as const;

/** Settings sections, in the order they render. */
export const SETTINGS_SECTIONS = [
    { path: "general", label: "General" },
    { path: "categories", label: "Categories" },
    { path: "flags", label: "Flags" },
    { path: "tagging", label: "Tagging" },
    { path: "budgets", label: "Budgets" },
    { path: "csv-maps", label: "CSV Maps" },
    { path: "imports", label: "Imports" },
] as const;

/**
 * Matches on a path SEGMENT rather than a suffix.
 *
 * Settings has sub-sections, so on /settings/categories nothing *ends with* "/settings" — a
 * suffix match would leave the tab bar with no selection at all.
 *
 * Returns MUI's `false` for "no tab", not -1.
 */
export function activeIndex(pathname: string, paths: readonly string[]): number | false {
    // react-router's location.pathname never carries a query or hash, but this is an
    // exported helper — trimming them means passing a full URL by mistake degrades to the
    // right answer instead of silently matching nothing.
    const segments = pathname.split(/[?#]/)[0].split("/");
    const index = paths.findIndex((p) => segments.includes(p));
    return index === -1 ? false : index;
}
