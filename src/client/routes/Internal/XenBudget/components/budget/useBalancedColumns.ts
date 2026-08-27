import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Round-robin fallback: each column gets an even share of cards. */
function roundRobin<T>(items: T[], count: number): T[][] {
    const cols: T[][] = Array.from({ length: count }, () => []);
    items.forEach((item, i) => cols[i % count].push(item));
    return cols;
}

/**
 * Distribute cards into a fixed number of columns, placing each card in the currently
 * shortest column (measured). The result is locked per card-list, so expanding a card
 * only grows its own column - cards never reshuffle into another column.
 *
 * Only the *assignment* is locked, and it's held as ids rather than the cards themselves:
 * editing a budget leaves its _id alone, so holding the objects would pin every card to
 * the values it had when the layout was worked out and nothing would ever visibly update.
 */
export function useBalancedColumns<T extends { _id: string }>(items: T[], columnCount: number) {
    const heights = useRef<Record<string, number>>({});
    const [locked, setLocked] = useState<{ key: string; cols: string[][] } | null>(null);

    const itemsKey = items.map((i) => i._id).join("|") + "@" + columnCount;

    useLayoutEffect(() => {
        if (locked?.key === itemsKey) return;
        const cols: string[][] = Array.from({ length: columnCount }, () => []);
        const colHeights = new Array(columnCount).fill(0);
        items.forEach((item) => {
            const h = heights.current[item._id] ?? 0;
            const shortest = colHeights.indexOf(Math.min(...colHeights));
            cols[shortest].push(item._id);
            colHeights[shortest] += h;
        });
        setLocked({ key: itemsKey, cols });
    }, [items, columnCount, itemsKey, locked]);

    const measureRef = useCallback((id: string) => (node: HTMLElement | null) => {
        if (node) heights.current[id] = node.offsetHeight;
    }, []);

    const byId = new Map(items.map((i) => [i._id, i]));
    const columns = locked?.key === itemsKey
        ? locked.cols.map((col) => col
            .map((id) => byId.get(id))
            .filter((item): item is T => !!item))
        : roundRobin(items, columnCount);

    return { columns, measureRef };
}
