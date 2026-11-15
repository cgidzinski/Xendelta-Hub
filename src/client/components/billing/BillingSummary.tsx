import { Box, LinearProgress, Link, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { formatGems, formatWholeGems } from "@shared/billing";
import { useMyBilling } from "../../hooks/billing/useBilling";
import { formatFileSize } from "../../utils/fileUtils";

// What you've used this month in gems and what is left of the free allowance, in the places that used to show a storage
// bar (docs/billing.md). File counts and sizes stay as information. The old upload limit still applies until the quota is
// removed (#362), so a nearly full drive says so rather than failing silently.

interface BillingSummaryProps {
  /** "card": a block for a sidebar or card; "line": one quiet line for a phone header or a menu. */
  variant?: "card" | "line";
  /** How much is stored, shown as information with no limit. */
  stored?: { fileCount: number; spaceUsed: number };
  /** The old upload limit, only mentioned when it is nearly reached. */
  limit?: { spaceUsed: number; spaceAllowed: number };
}

const NEARLY_FULL = 0.9;

export default function BillingSummary({ variant = "card", stored, limit }: BillingSummaryProps) {
  const { data } = useMyBilling();
  if (!data) return null;
  const { current } = data;
  const share = current.freeTierGems > 0 ? Math.min(1, current.freeTierUsed / current.freeTierGems) : 0;
  const nearlyFull = !!limit && limit.spaceAllowed > 0 && limit.spaceUsed / limit.spaceAllowed >= NEARLY_FULL;
  const used = current.usageGems > 0 ? formatGems(current.usageGems) : "Nothing yet";
  const left = `${formatWholeGems(Math.max(0, Math.floor(current.freeTierLeft)))} free left`;

  if (variant === "line") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Link component={RouterLink} to="/internal/billing" variant="caption" underline="hover">
          This month: {used} · {left}
        </Link>
        {stored && (
          <Typography variant="caption" color="text.secondary">
            {formatFileSize(stored.spaceUsed)} stored
          </Typography>
        )}
        {nearlyFull && (
          <Typography variant="caption" color="warning.main">
            Upload limit almost reached
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          This month
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {used}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={share * 100}
        aria-label="Free allowance used"
        color={share >= 1 ? "warning" : "primary"}
        sx={{ height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
        {left}
      </Typography>
      {stored && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {stored.fileCount} {stored.fileCount === 1 ? "file" : "files"} · {formatFileSize(stored.spaceUsed)}
        </Typography>
      )}
      {nearlyFull && limit && (
        <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.75 }}>
          Upload limit almost reached ({formatFileSize(limit.spaceUsed)} of {formatFileSize(limit.spaceAllowed)})
        </Typography>
      )}
      <Link
        component={RouterLink}
        to="/internal/billing"
        underline="none"
        variant="body2"
        sx={{ display: "inline-block", mt: 0.75 }}
      >
        See your billing
      </Link>
    </Box>
  );
}
