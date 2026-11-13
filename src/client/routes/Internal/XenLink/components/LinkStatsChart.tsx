import { Box, Typography } from "@mui/material";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { XenLinkStats } from "../../../../hooks/xenlink/useXenlink";

/** Clicks per day for the last 30 days as small bars, with the total and when it was last used. */
export default function LinkStatsChart({ stats }: { stats: XenLinkStats }) {
  const max = Math.max(1, ...stats.days.map((d) => d.n));
  const recent = stats.days.reduce((sum, d) => sum + d.n, 0);
  const summary = `${stats.clicks} ${stats.clicks === 1 ? "click" : "clicks"} in total, ${recent} in the last ${stats.days.length} days`;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {summary}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {stats.lastClickedAt
            ? `Last clicked ${formatDistanceToNow(new Date(stats.lastClickedAt), { addSuffix: true })}`
            : "Not clicked yet"}
        </Typography>
      </Box>
      <Box
        role="img"
        aria-label={`Clicks per day: ${summary}`}
        sx={{
          display: "flex",
          alignItems: "flex-end",
          gap: "2px",
          height: 56,
          mt: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {stats.days.map((d) => (
          <Box
            key={d.day}
            title={`${d.day}: ${d.n} ${d.n === 1 ? "click" : "clicks"}`}
            sx={{
              flex: 1,
              minWidth: 0,
              height: d.n === 0 ? "2px" : `${Math.max(8, (d.n / max) * 100)}%`,
              bgcolor: d.n === 0 ? "divider" : "primary.main",
              borderRadius: "2px 2px 0 0",
            }}
          />
        ))}
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {parseISO(stats.days[0].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Today
        </Typography>
      </Box>
    </Box>
  );
}
