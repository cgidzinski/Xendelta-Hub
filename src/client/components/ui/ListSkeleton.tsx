import { Box, Skeleton } from "@mui/material";

interface ListSkeletonProps {
  /** How many placeholder rows to draw. Match the page's usual density, not its maximum. */
  rows?: number;
  /** Row height in px. Should match the real row so nothing shifts when data lands. */
  height?: number;
  /** Gap between rows, in theme spacing units. */
  gap?: number;
}

/**
 * Placeholder rows for a list that is still loading.
 *
 * Prefer this to a centred spinner wherever the final shape is known: a spinner occupies
 * a different amount of space than the content that replaces it, so the page jumps on
 * settle. Radius is fixed at the card radius so these line up with the real rows.
 */
export default function ListSkeleton({ rows = 4, height = 72, gap = 1.5 }: ListSkeletonProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rectangular" height={height} sx={{ borderRadius: 2 }} />
      ))}
    </Box>
  );
}
