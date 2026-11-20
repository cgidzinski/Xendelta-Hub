import { Box, Skeleton } from "@mui/material";
import { useDelayedVisible } from "../ui/useDelayedVisible";

/** Placeholder shaped like `BillingView`: a summary card, a two-column row of cards, then a table. */
export default function BillingSkeleton() {
  const visible = useDelayedVisible(300);
  const block = (height: number) => <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 2 }} />;
  return (
    <Box
      aria-hidden
      sx={{ visibility: visible ? "visible" : "hidden", display: "flex", flexDirection: "column", gap: 2.5 }}
    >
      {block(150)}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" } }}>
        {block(220)}
        {block(220)}
      </Box>
      {block(200)}
    </Box>
  );
}
