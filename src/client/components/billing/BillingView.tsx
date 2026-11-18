import type { ReactNode } from "react";
import {
  Box,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  COST_CENTERS,
  billedRate,
  formatGems,
  formatWholeGems,
  type BillingOverview,
  type PastStatement,
} from "@shared/billing";
import SectionLabel from "../ui/SectionLabel";
import EmptyState from "../ui/EmptyState";
import { cardSx } from "../ui/surfaceStyles";
import { CHART_COLORS } from "../ui/chartColors";

// The Billing view (docs/billing.md), shared by your own Billing page and a community's Billing tab: this month so far
// by kind of use, the free allowance, the balance, and past statements. Never per file or per call.

const monthDate = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

/** "November 2026". */
export const monthName = (month: string) =>
  monthDate(month).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Dec 1": when the next month (and a fresh free allowance) starts. */
export const nextMonthStart = (month: string) => {
  const d = monthDate(month);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

function SummaryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ ...cardSx, p: 2.5 }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </Box>
  );
}

const bigNumberSx = { fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 } as const;

/** What is left of the free allowance this month: one number and a bar. */
function FreeAllowance({ overview }: { overview: BillingOverview }) {
  const { current } = overview;
  const total = current.freeTierGems;
  const left = Math.max(0, Math.floor(current.freeTierLeft));
  return (
    <SummaryCard label="Free allowance">
      <Typography sx={bigNumberSx}>{formatWholeGems(left)} left</Typography>
      <LinearProgress
        variant="determinate"
        value={total > 0 ? Math.min(100, (current.freeTierUsed / total) * 100) : 0}
        aria-label="Free allowance in use"
        sx={{ my: 1.25, height: 6, borderRadius: 999 }}
      />
      <Typography variant="body2" color="text.secondary">
        of {formatWholeGems(total)} a month
      </Typography>
    </SummaryCard>
  );
}

/** This month's cost by kind of use, as a ring with its key. */
function MonthCost({ overview }: { overview: BillingOverview }) {
  const theme = useTheme();
  const { current, centers } = overview;
  const lines = new Map(current.lines.map((l) => [l.center, l]));
  const rows = centers
    .map((c, i) => ({
      id: c.id,
      label: c.label,
      gems: lines.get(c.id)?.gems ?? 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
    .filter((r) => r.gems > 0);
  const empty = rows.length === 0;
  return (
    <SummaryCard label="This month">
      <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, flexWrap: "wrap" }}>
        <Box sx={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={empty ? [{ id: "none", gems: 1 }] : rows}
                dataKey="gems"
                nameKey="label"
                innerRadius={46}
                outerRadius={66}
                paddingAngle={empty ? 0 : 2}
                stroke="none"
                isAnimationActive={false}
              >
                {empty ? <Cell fill={theme.palette.divider} /> : rows.map((r) => <Cell key={r.id} fill={r.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.1, textAlign: "center" }}>
              {formatGems(current.usageGems)}
            </Typography>
          </Box>
        </Box>
        <Stack spacing={0.75} sx={{ minWidth: 140, flex: 1 }}>
          {empty ? (
            <Typography variant="body2" color="text.secondary">
              Nothing used yet
            </Typography>
          ) : (
            rows.map((r) => (
              <Box key={r.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: r.color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {r.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatGems(r.gems)}
                </Typography>
              </Box>
            ))
          )}
        </Stack>
      </Box>
    </SummaryCard>
  );
}

const STATUS: Record<PastStatement["status"], { label: string; color: "success" | "warning" | "default" | "error" }> = {
  free: { label: "Inside the free allowance", color: "success" },
  paid: { label: "Paid", color: "default" },
  shadow: { label: "Not charged", color: "warning" },
  unpaid: { label: "Not paid yet", color: "error" },
  pending: { label: "Being settled", color: "default" },
};

function Statements({ overview }: { overview: BillingOverview }) {
  return (
    <Box component="section" sx={{ ...cardSx }}>
      <Typography
        component="h2"
        variant="subtitle1"
        sx={{ fontWeight: 600, px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
      >
        Past statements
      </Typography>
      {overview.statements.length === 0 ? (
        <EmptyState
          icon={<ReceiptLongOutlinedIcon />}
          title="No statements yet"
          description={`Your first statement for ${monthName(overview.month).split(" ")[0]} arrives on ${nextMonthStart(overview.month)}.`}
          sx={{ py: 5 }}
        />
      ) : (
        overview.statements.map((s, i) => (
          <Box
            key={s.month}
            sx={{
              px: 2.5,
              py: 1.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
              borderTop: i === 0 ? 0 : 1,
              borderColor: "divider",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {monthName(s.month)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatGems(s.usageGems)} used · {formatWholeGems(Math.round(s.freeTierUsed))} free
              </Typography>
            </Box>
            <Stack alignItems="flex-end" spacing={0.5}>
              <Typography variant="body2">{formatWholeGems(s.amountDue)}</Typography>
              <Chip size="small" variant="outlined" label={STATUS[s.status].label} color={STATUS[s.status].color} />
            </Stack>
          </Box>
        ))
      )}
    </Box>
  );
}

const ratePer = (id: string) => {
  const center = COST_CENTERS.find((c) => c.id === id);
  return center ? billedRate(center) : 0;
};
const gems = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} gems`;

/** What costs gems, as a small table with the current prices. For a person, or for a community when `communityName` is set. */
function HowBillingWorks({ overview, communityName }: { overview: BillingOverview; communityName?: string }) {
  const rows: Array<[string, string, string]> = [
    [
      "Files",
      `${gems(ratePer("storage"))} per GB a month`,
      communityName ? "Channel files and emoji: the community" : "You (the community, in its channels)",
    ],
    [
      "Calls",
      `${gems(ratePer("calls"))} per GB`,
      communityName ? "Voice channels: the community" : "Shared evenly by everyone in the call",
    ],
    ["Recipe scans", `${gems(ratePer("recipe_scans"))} each`, communityName ? "The person scanning" : "You"],
    ["Receipt scans", `${gems(ratePer("receipt_scans"))} each`, communityName ? "The person scanning" : "You"],
    ["Free each month", formatWholeGems(overview.current.freeTierGems), "Doesn't roll over"],
  ];
  return (
    <Box component="section" sx={{ ...cardSx, overflow: "hidden" }}>
      <Typography
        component="h2"
        variant="subtitle1"
        sx={{ fontWeight: 600, px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
      >
        How billing works
      </Typography>
      <Table size="small" aria-label="What costs gems">
        <TableHead>
          <TableRow>
            <TableCell>What</TableCell>
            <TableCell>Costs</TableCell>
            <TableCell>Paid by</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(([what, cost, who]) => (
            <TableRow key={what}>
              <TableCell sx={{ fontWeight: 500 }}>{what}</TableCell>
              <TableCell>{cost}</TableCell>
              <TableCell sx={{ color: "text.secondary" }}>{who}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, py: 1.75 }}>
        Charged on the 1st of next month beyond the free allowance, from {communityName ? "the fund" : "your gems"}. If
        it runs out, new uploads, calls and scans pause. Nothing is deleted.
      </Typography>
    </Box>
  );
}

interface BillingViewProps {
  overview: BillingOverview;
  /** The third summary card: your gems, or the community's fund. */
  balanceCard: ReactNode;
  /** Who pays beyond the free allowance (not shown any more; the table says it). */
  paidFrom?: string;
  /** "Trail Crew", for the notice; omitted for your own bill. */
  communityName?: string;
  /** Extra sections after the costs (a community's fund history). */
  children?: ReactNode;
}

export default function BillingView({ overview, balanceCard, communityName, children }: BillingViewProps) {
  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.4fr) minmax(0, 1fr)" } }}>
        <MonthCost overview={overview} />
        <Stack spacing={2}>
          <FreeAllowance overview={overview} />
          {balanceCard}
        </Stack>
      </Box>
      {children}
      <Statements overview={overview} />
      <HowBillingWorks overview={overview} communityName={communityName} />
    </Stack>
  );
}

/** "Covers about 4 months at this pace", or that nothing is due. */
export function coverageText(overview: BillingOverview): string {
  if (overview.unpaid > 0) return `${formatWholeGems(overview.unpaid)} still to pay from earlier months`;
  if (overview.monthsCovered === null) return "Nothing to pay this month";
  const months = Math.floor(overview.monthsCovered);
  if (months < 1) return "Less than a month at this pace";
  return `Covers about ${months} ${months === 1 ? "month" : "months"} at this pace`;
}

export { bigNumberSx };
