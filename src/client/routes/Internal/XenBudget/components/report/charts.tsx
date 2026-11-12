import { Box, Card, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { INCOME_COLOR, MAGNITUDE_COLOR } from "../../../../../components/ui/chartColors";
import { cardSx, sectionLabelSx } from "../../../../../components/ui/surfaceStyles";

// Recharts elements take literal colors, not theme tokens, so every chart in this file
// resolves its chrome through this once, from whichever mode is active.
export function chartTheme(theme: Theme) {
  return {
    axis: { stroke: theme.palette.text.secondary, fontSize: 12 } as const,
    grid: theme.palette.divider,
    cursor: { fill: theme.palette.action.hover },
    tooltipStyle: {
      contentStyle: {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 8,
      },
      labelStyle: { color: theme.palette.text.secondary },
    },
    labelFill: theme.palette.text.secondary,
  };
}

// Wide enough for the longest formatted value sitting to the right of the longest bar;
// at 72 the top bar's label was clipped by the container edge.
export const VALUE_LABEL_GUTTER = 104;

export const CATEGORY_WIDTH = 132;

/**
 * Horizontal magnitude bars, with the category named on the axis and its value labelled
 * directly - a value readable only by hovering isn't readable at all on a touch screen.
 *
 * `colorFor` gives each bar its own colour (e.g. matching a category's chip); without it
 * every bar takes the flat `color`. Not both at once - past eight distinct colours two
 * would end up indistinguishable anyway, which is `colorFor`'s callers' job to avoid.
 */
export function MagnitudeBars<T extends { name: string; total: number }>({
  data,
  money,
  compact,
  color = MAGNITUDE_COLOR,
  colorFor,
}: {
  data: T[];
  money: (v: number) => string;
  compact: (v: number) => string;
  color?: string;
  colorFor?: (d: T) => string;
}) {
  const { axis, grid, cursor, tooltipStyle, labelFill } = chartTheme(useTheme());
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: VALUE_LABEL_GUTTER, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={grid} horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => compact(Number(v))} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={CATEGORY_WIDTH} />
        <Tooltip formatter={(v) => money(Number(v))} cursor={cursor} {...tooltipStyle} />
        <Bar
          dataKey="total"
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          label={{ position: "right", fill: labelFill, fontSize: 12, formatter: (v: unknown) => money(Number(v)) }}
        >
          {colorFor && data.map((d, i) => <Cell key={i} fill={colorFor(d)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * One overlapping bar per person: spend and income compared directly rather than as two
 * separate charts. `front` (min of the two) is stacked with `back` (the remainder up to
 * their max) - the smaller value simply paints over the start of the larger one, which
 * looks exactly like a true overlap without needing one. Colour is per-row via `Cell`
 * (whichever of red/green is "the bigger one" flips per person, not per series), and the
 * tooltip reads the row's real spent/income rather than the internal front/back split.
 */
export function PersonFlowBars({
  data,
  money,
  compact,
}: {
  data: {
    name: string;
    spent: number;
    income: number;
    front: number;
    back: number;
    frontColor: string;
    backColor: string;
  }[];
  money: (v: number) => string;
  compact: (v: number) => string;
}) {
  const theme = useTheme();
  const { axis, grid, cursor, tooltipStyle } = chartTheme(theme);
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={grid} horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => compact(Number(v))} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={CATEGORY_WIDTH} />
        <Tooltip
          cursor={cursor}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof data)[number];
            return (
              <Box
                sx={{
                  ...tooltipStyle.contentStyle,
                  px: 1.25,
                  py: 0.75,
                }}
              >
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                  {row.name}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", color: "error.main" }}>
                  Spent {money(row.spent)}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", color: INCOME_COLOR }}>
                  Income {money(row.income)}
                </Typography>
              </Box>
            );
          }}
        />
        {/* The real series ("front"/"back") don't mean anything on their own -
                which one is red vs. green flips per person - so the legend is drawn by
                hand rather than from the series recharts would otherwise infer. */}
        <Legend
          content={() => (
            <Stack direction="row" justifyContent="center" spacing={2} sx={{ pt: 1 }}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "error.main" }} />
                <Typography variant="caption" color="text.secondary">
                  Spent
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: INCOME_COLOR }} />
                <Typography variant="caption" color="text.secondary">
                  Income
                </Typography>
              </Stack>
            </Stack>
          )}
        />
        <Bar dataKey="front" stackId="flow" radius={[4, 0, 0, 4]} maxBarSize={22}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.frontColor} />
          ))}
        </Bar>
        <Bar dataKey="back" stackId="flow" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.backColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Donut of spending split by need vs want, with the needs share in the middle. Other is
 * the tail of unclassified categories plus anything uncategorised — kept so the two
 * slices don't silently pretend to be the whole pie.
 */
export function NeedWantDonut({
  data,
  money,
}: {
  data: { name: string; total: number; color: string }[];
  money: (v: number) => string;
}) {
  const { tooltipStyle } = chartTheme(useTheme());
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const needs = data.find((d) => d.name === "Needs")?.total ?? 0;
  const needsShare = total > 0 ? Math.round((needs / total) * 100) : 0;
  // Zero-value slices would draw nothing but can still trip up the angle maths; the
  // legend below keeps showing them regardless.
  const slices = data.filter((d) => d.total > 0);
  return (
    <Box>
      <Box sx={{ position: "relative", height: 220, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v))} {...tooltipStyle} />
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
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
              {needsShare}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              needs
            </Typography>
          </Box>
        </Box>
      </Box>
      <Stack direction="row" justifyContent="center" spacing={2} sx={{ pt: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        {data.map((d) => (
          <Stack key={d.name} direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: d.color }} />
            <Typography variant="caption" color="text.secondary">
              {d.name} · {money(d.total)}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
      <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Card>
  );
}
