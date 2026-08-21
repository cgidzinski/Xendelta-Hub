// One categorical palette shared by XenBudget's tag chips and its charts, so a tag's
// chip and its pie slice are the same colour. (Xensplit's GroupAnalytics and the admin
// casino page each carry their own hardcoded copy; those are left alone.)
//
// Chosen to stay legible on the app's dark surfaces and to be distinguishable in order.
export const CHART_COLORS = [
    "#6366f1", // indigo
    "#22d3ee", // cyan
    "#f59e0b", // amber
    "#10b981", // emerald
    "#f43f5e", // rose
    "#a78bfa", // violet
    "#fb923c", // orange
    "#34d399", // green
    "#60a5fa", // blue
    "#e879f9", // fuchsia
] as const;

export function chartColorAt(index: number): string {
    return CHART_COLORS[index % CHART_COLORS.length];
}

// Stable colour for a label with no explicitly assigned one. Hashing the name (rather
// than using list position) keeps a tag the same colour as tags are added and removed
// around it, and keeps it consistent between the item list and the charts.
export function colorForLabel(label: string): string {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = (hash * 31 + label.charCodeAt(i)) | 0;
    }
    return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
}
