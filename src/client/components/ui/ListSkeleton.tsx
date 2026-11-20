import { Box, Skeleton, keyframes, type SxProps, type Theme } from "@mui/material";
import { useDelayedVisible } from "./useDelayedVisible";

interface ListSkeletonProps {
  /** How many placeholder rows (or tiles) to draw. Match the page's usual density, not its maximum. */
  rows?: number;
  /** Row height in px. Should match the real row so nothing shifts when data lands. */
  height?: number;
  /** Gap between rows, in theme spacing units. */
  gap?: number;
  /**
   * Draw a responsive grid of tiles instead of a column of rows, for pages whose content loads as a grid.
   * Pass the column counts the real grid uses, e.g. `{ xs: 2, md: 4 }`.
   */
  columns?: number | Record<string, number>;
  /** How long to wait before showing anything, so a fast response never flashes a skeleton. */
  delayMs?: number;
}

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;

/**
 * Placeholder rows for a list that is still loading.
 *
 * Prefer this to a centred spinner wherever the final shape is known: a spinner occupies
 * a different amount of space than the content that replaces it, so the page jumps on
 * settle. Radius is fixed at the card radius so these line up with the real rows.
 *
 * It waits `delayMs` (300 by default) and then fades in, so quick loads show no flash at all.
 */
export default function ListSkeleton({ rows = 4, height = 72, gap = 1.5, columns, delayMs = 300 }: ListSkeletonProps) {
  const visible = useDelayedVisible(delayMs);

  // Keep the space reserved while waiting so the page does not jump when the skeleton appears.
  const layout: SxProps<Theme> = columns
    ? {
        display: "grid",
        gap,
        gridTemplateColumns:
          typeof columns === "number"
            ? `repeat(${columns}, 1fr)`
            : Object.fromEntries(Object.entries(columns).map(([bp, n]) => [bp, `repeat(${n}, 1fr)`])),
      }
    : { display: "flex", flexDirection: "column", gap };

  return (
    <Box
      aria-hidden
      sx={{
        ...layout,
        visibility: visible ? "visible" : "hidden",
        animation: visible ? `${fadeIn} 200ms ease` : "none",
      }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rectangular" height={height} sx={{ borderRadius: 2 }} />
      ))}
    </Box>
  );
}
