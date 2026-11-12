import { Link as RouterLink } from "react-router-dom";
import { Avatar, Box, Link, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { formatMoney } from "@shared/money";
import PageHeader from "../../components/ui/PageHeader";
import ErrorDisplay from "../../components/ErrorDisplay";
import ListSkeleton from "../../components/ui/ListSkeleton";
import { useTitle } from "../../hooks/useTitle";
import { useAdminOverview } from "../../hooks/admin/useAdminData";
import { formatFileSize } from "../../utils/fileUtils";
import StatCard from "./components/StatCard";
import { timeAgo } from "./adminFormat";

const card = { border: 1, borderColor: "divider", borderRadius: 2, p: 2.25 } as const;

/** A line of the last 30 days, drawn from the numbers (no chart library for one line). */
function SignupChart({ points }: { points: Array<{ day: string; count: number }> }) {
  const theme = useTheme();
  const max = Math.max(1, ...points.map((p) => p.count));
  const line = points
    .map(
      (p, i) => `${Math.round((i / Math.max(1, points.length - 1)) * 600)},${Math.round(130 - (p.count / max) * 120)}`,
    )
    .join(" ");
  const label = (day?: string) =>
    day ? new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const first = label(points[0]?.day);
  const last = label(points[points.length - 1]?.day);
  return (
    <>
      <svg
        viewBox="0 0 600 140"
        width="100%"
        height="140"
        preserveAspectRatio="none"
        role="img"
        aria-label={`New people per day, ${first} to ${last}`}
      >
        <polyline
          points={line}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <Box sx={{ display: "flex", justifyContent: "space-between", color: "text.disabled", fontSize: 12 }}>
        <span>{first}</span>
        <span>{last}</span>
      </Box>
    </>
  );
}

export default function Overview() {
  useTitle("Admin");
  const { data, isLoading, isError, error, refetch } = useAdminOverview();

  return (
    <Box>
      <PageHeader title="Overview" subtitle="How the platform is doing, and what needs you" />
      {isLoading ? (
        <ListSkeleton rows={4} height={110} />
      ) : isError || !data ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load the overview" onRetry={() => refetch()} />
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
              gap: 2,
              mb: 2,
            }}
          >
            <StatCard
              label="People"
              value={data.people.total.toLocaleString()}
              note={`+${data.people.new7} in the last 7 days`}
              noteTone="success"
            />
            <StatCard
              label="Storage used"
              value={formatFileSize(data.storage.used)}
              note={
                data.storage.nearQuota > 0 ? `${data.storage.nearQuota} near their limit` : "No one near their limit"
              }
              noteTone={data.storage.nearQuota > 0 ? "warning" : undefined}
            />
            <StatCard
              label="Gems bought (30 days)"
              value={data.money.gems30.toLocaleString()}
              note={`${formatMoney(data.money.cents30 / 100, "USD", { symbol: "narrow" })} from ${data.money.purchases30} ${data.money.purchases30 === 1 ? "purchase" : "purchases"}`}
            />
            <StatCard
              label="Needs attention"
              value={data.attention.length}
              valueTone={data.attention.length > 0 ? "warning" : undefined}
              note={
                data.attention.length === 0
                  ? "All clear"
                  : `${data.tasks.failing} failing ${data.tasks.failing === 1 ? "task" : "tasks"}, ${data.money.pending} pending`
              }
            />
          </Box>

          <Box
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.5fr) minmax(0, 1fr)" }, gap: 2 }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={card}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>New people</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {data.people.new30} in 30 days
                  </Typography>
                </Box>
                <SignupChart points={data.people.signupsByDay} />
              </Box>

              <Box sx={card}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1.5 }}>
                  <Typography sx={{ fontWeight: 600 }}>Storage by app</Typography>
                  <Link component={RouterLink} to="/admin/storage" underline="hover" variant="body2">
                    See storage
                  </Link>
                </Box>
                {data.storage.byApp.map((a) => {
                  const share = data.storage.used > 0 ? (a.bytes / data.storage.used) * 100 : 0;
                  return (
                    <Box key={a.key} sx={{ mb: 1.5 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography variant="body2">{a.label}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatFileSize(a.bytes)}
                        </Typography>
                      </Box>
                      <Box sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}>
                        <Box
                          sx={{
                            height: 8,
                            width: `${Math.max(2, share)}%`,
                            bgcolor: a.key === "drive" ? "primary.main" : "info.main",
                            borderRadius: 4,
                          }}
                        />
                      </Box>
                    </Box>
                  );
                })}
                <Typography variant="caption" color="text.disabled">
                  Photos in other apps (XenSplit, XenNote, ...) are stored but not counted yet.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={card}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Needs attention</Typography>
                {data.attention.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
                    Nothing needs you right now.
                  </Typography>
                )}
                {data.attention.map((item) => (
                  <Box
                    key={item.key}
                    component={RouterLink}
                    to={item.href}
                    sx={{
                      display: "flex",
                      gap: 1.5,
                      py: 1.25,
                      borderTop: 1,
                      borderColor: "divider",
                      textDecoration: "none",
                      color: "text.primary",
                      alignItems: "flex-start",
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        mt: 0.9,
                        flexShrink: 0,
                        bgcolor: `${item.severity}.main`,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {item.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.detail}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="primary.main">
                      {item.action}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={card}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 600 }}>Recent admin activity</Typography>
                  <Link component={RouterLink} to="/admin/audit" underline="hover" variant="body2">
                    Audit log
                  </Link>
                </Box>
                {data.recent.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
                    No changes yet.
                  </Typography>
                )}
                {data.recent.map((e) => (
                  <Box
                    key={e._id}
                    sx={{
                      display: "flex",
                      gap: 1.5,
                      py: 1,
                      borderTop: 1,
                      borderColor: "divider",
                      alignItems: "flex-start",
                    }}
                  >
                    <Avatar sx={{ width: 24, height: 24, fontSize: 11 }}>{e.admin.username[0]?.toUpperCase()}</Avatar>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                      <strong>{e.admin.username}</strong> · {e.target.label}: {e.detail}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                      {timeAgo(e.createdAt)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
