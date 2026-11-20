import { Box, Skeleton } from "@mui/material";
import { useDelayedVisible } from "./useDelayedVisible";

interface DetailSkeletonProps {
  /** Height of the main block under the header (a preview, a card), in px. */
  height?: number;
  /** Show a circle at the start of the header, for a person or avatar page. */
  avatar?: boolean;
  delayMs?: number;
}

/** Placeholder for a detail page: a header line, a few text lines and one large block. Delays like `ListSkeleton`. */
export default function DetailSkeleton({ height = 280, avatar = false, delayMs = 300 }: DetailSkeletonProps) {
  const visible = useDelayedVisible(delayMs);
  return (
    <Box
      aria-hidden
      sx={{ visibility: visible ? "visible" : "hidden", display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {avatar ? (
          <Skeleton variant="circular" width={56} height={56} />
        ) : (
          <Skeleton variant="circular" width={32} height={32} />
        )}
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="45%" sx={{ fontSize: "1.25rem" }} />
          <Skeleton variant="text" width="25%" />
        </Box>
      </Box>
      <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 2 }} />
    </Box>
  );
}
