import type { ReactNode } from "react";
import { Alert, Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  COST_CENTERS,
  billedRate,
  ceilGems,
  formatGems,
  formatWholeGems,
  type BillingOverview,
  type PastStatement,
  type StatementLine,
} from "@shared/billing";
import SectionLabel from "../ui/SectionLabel";
import EmptyState from "../ui/EmptyState";
import { cardSx } from "../ui/surfaceStyles";

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

/** "2.4 GB-month", "3 scans". */
function formatQuantity(quantity: number, unit: string): string {
  if (quantity === 0) return "Not used yet";
  const rounded = quantity >= 10 ? Math.round(quantity) : Math.ceil(quantity * 10) / 10;
  const text = rounded < 0.1 ? "less than 0.1" : rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const plural = unit === "scan" || unit === "email" ? (rounded === 1 ? unit : `${unit}s`) : unit;
  return `${text} ${plural}`;
}

function SummaryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ ...cardSx, p: 2.5 }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </Box>
  );
}

const bigNumberSx = { fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 } as const;

function FreeAllowance({ overview, paidFrom }: { overview: BillingOverview; paidFrom: string }) {
  const { current, month } = overview;
  const total = current.freeTierGems;
  const used = Math.min(current.usageGems, total);
  const allIn = total > 0 && current.usageGems >= total;
  const beyond = current.usageGems - total;
  return (
    <SummaryCard label="Free allowance">
      <Typography sx={bigNumberSx}>
        {allIn
          ? `${total.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`
          : `${ceilGems(current.freeTierLeft).toLocaleString("en-US")} left`}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={total > 0 ? (used / total) * 100 : 0}
        aria-label="Free allowance in use"
        sx={{ my: 1.25, height: 6, borderRadius: 999 }}
      />
      <Typography variant="body2" color="text.secondary">
        {allIn
          ? `Covered by the free allowance this month.${beyond > 0 ? ` The ${formatGems(beyond)} after it come from ${paidFrom}.` : ""} Starts fresh ${nextMonthStart(month)}.`
          : `${formatWholeGems(total)} a month. It doesn't roll over.`}
      </Typography>
    </SummaryCard>
  );
}

function CostRows({ overview }: { overview: BillingOverview }) {
  const lines = new Map<string, StatementLine>(overview.current.lines.map((l) => [l.center, l]));
  return (
    <Box component="section" sx={{ ...cardSx }}>
      <Box sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
          This month by cost
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Priced per kind of use, never per file or call.
        </Typography>
      </Box>
      {overview.centers.map((center, i) => {
        const line = lines.get(center.id);
        return (
          <Box
            key={center.id}
            sx={{
              px: 2.5,
              py: 1.75,
              display: "grid",
              gap: { xs: 0.5, sm: 2 },
              gridTemplateColumns: { xs: "1fr auto", sm: "minmax(0, 1fr) 150px 150px 110px" },
              alignItems: "center",
              borderTop: i === 0 ? 0 : 1,
              borderColor: "divider",
            }}
          >
            <Box sx={{ minWidth: 0, gridColumn: { xs: "1 / 2", sm: "auto" } }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {center.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {center.description}
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color={line && line.units > 0 ? "text.primary" : "text.secondary"}
              sx={{ gridRow: { xs: 2, sm: "auto" } }}
            >
              {formatQuantity(line?.quantity ?? 0, center.displayUnit)}
            </Typography>
            <Typography
              variant="body2"
              color={center.free ? "success.main" : "text.secondary"}
              sx={{ gridRow: { xs: 2, sm: "auto" }, textAlign: { xs: "right", sm: "left" } }}
            >
              {center.free ? "Free for now" : `${formatGems(center.rate)} per ${center.displayUnit}`}
            </Typography>
            <Typography
              variant="body2"
              sx={{ gridRow: { xs: 1, sm: "auto" }, gridColumn: { xs: "2 / 3", sm: "auto" }, textAlign: "right" }}
            >
              {formatGems(line?.gems ?? 0)}
            </Typography>
          </Box>
        );
      })}
    </Box>
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

/** How billing works, in plain words, with the current prices. For a person, or for a community when `communityName` is set. */
function HowBillingWorks({ overview, communityName }: { overview: BillingOverview; communityName?: string }) {
  const paidFrom = communityName ? "the community's fund" : "your gems";
  const items: Array<[string, string]> = [
    [
      "Files",
      `${gems(ratePer("storage"))} for each GB you keep for a month, counted once a day, so a file you delete stops costing from the next day.${
        communityName
          ? " Files shared in the community's channels and its custom emoji are the community's."
          : " Files in community channels are paid by the community, not by you."
      }`,
    ],
    [
      "Calls",
      `${gems(ratePer("calls"))} for each GB of call audio and video.${
        communityName
          ? " Voice channels are paid from the fund as they are used."
          : " In a call between people, the cost is shared evenly between everyone in it."
      }`,
    ],
    ["Recipe scans", `${gems(ratePer("recipe_scans"))} for each recipe you read from a photo.`],
    ["Receipt scans", `${gems(ratePer("receipt_scans"))} for each receipt you read from a photo.`],
    [
      "Free every month",
      `${formatWholeGems(overview.current.freeTierGems)} of everything above is free each month. It doesn't carry over to the next month.`,
    ],
    [
      "When it's charged",
      `Beyond the free allowance, the month's total is taken from ${paidFrom} on the 1st of the next month, rounded up to a whole gem once.`,
    ],
    [
      "If there aren't enough gems",
      `New uploads, calls and scans pause until ${communityName ? "someone donates" : "you add gems"}. Nothing is ever deleted, and ${
        communityName ? "everyone" : "you"
      } can still open, download and delete ${communityName ? "their" : "your"} files.`,
    ],
  ];
  return (
    <Box component="section" sx={{ ...cardSx, p: 2.5 }}>
      <SectionLabel>How billing works</SectionLabel>
      <Stack spacing={1.5}>
        {items.map(([title, text]) => (
          <Box key={title}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {text}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

interface BillingViewProps {
  overview: BillingOverview;
  /** The third summary card: your gems, or the community's fund. */
  balanceCard: ReactNode;
  /** Who pays beyond the free allowance, for the wording: "your gems" or "the fund". */
  paidFrom: string;
  /** "Trail Crew", for the notice; omitted for your own bill. */
  communityName?: string;
  /** Extra sections after the costs (a community's fund history). */
  children?: ReactNode;
}

export default function BillingView({ overview, balanceCard, paidFrom, communityName, children }: BillingViewProps) {
  const { current } = overview;
  return (
    <Stack spacing={2.5}>
      {overview.everythingFree ? (
        <Alert severity="info" variant="outlined">
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Everything is free right now
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {communityName
              ? `Nothing is charged to ${communityName}. If that changes, the price shows here first and the community gets a free allowance every month.`
              : "Nothing is charged. When something starts to cost gems, you'll see its price here first, and you'll always get a free allowance each month."}
          </Typography>
        </Alert>
      ) : null}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
        <SummaryCard label="This month so far">
          <Typography sx={bigNumberSx}>{formatGems(current.usageGems)}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            On track for {overview.projectedGems > 0 ? "about " : ""}
            {formatGems(overview.projectedGems)} this month
          </Typography>
        </SummaryCard>
        <FreeAllowance overview={overview} paidFrom={paidFrom} />
        {balanceCard}
      </Box>

      <CostRows overview={overview} />
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
