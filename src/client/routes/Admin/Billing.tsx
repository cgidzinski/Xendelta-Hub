import { useState } from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import type { AdminBillingCenterRow, AdminBillingProviderRow } from "@shared/admin";
import { formatGems, formatWholeGems } from "@shared/billing";
import { formatMoney } from "@shared/money";
import PageHeader from "../../components/ui/PageHeader";
import ErrorDisplay from "../../components/ErrorDisplay";
import ListSkeleton from "../../components/ui/ListSkeleton";
import { useTitle } from "../../hooks/useTitle";
import { useAdminBilling, useSetProviderCost } from "../../hooks/admin/useAdminData";
import DataTable, { type Column } from "./components/DataTable";
import StatCard from "./components/StatCard";
import StatusChip from "./components/StatusChip";

const usd = (cents: number) => formatMoney(cents / 100, "USD", { symbol: "narrow" });
const quantity = (q: number, unit: string) => {
  const counted = unit === "scan" || unit === "email";
  const label = counted && q !== 1 ? `${unit}s` : unit;
  return `${q.toLocaleString("en-US", { maximumFractionDigits: q < 10 ? 2 : 0 })} ${label}`;
};

function ActualCost({ row, month }: { row: AdminBillingProviderRow; month: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const save = useSetProviderCost();
  const [value, setValue] = useState(row.actualCents === null ? "" : (row.actualCents / 100).toFixed(2));
  const dollars = value.trim() === "" ? null : Number(value);
  const invalid = dollars !== null && (!Number.isFinite(dollars) || dollars < 0);
  const changed = (dollars === null ? null : Math.round(dollars * 100)) !== row.actualCents;

  const submit = async () => {
    try {
      await save.mutateAsync({
        month,
        provider: row.provider,
        amountCents: dollars === null ? null : Math.round(dollars * 100),
      });
      enqueueSnackbar("Saved", { variant: "success" });
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't save", { variant: "error" });
    }
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        label="Invoice ($)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={invalid}
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
        sx={{ width: 130 }}
      />
      <Button size="small" disabled={!changed || invalid || save.isPending} onClick={submit}>
        Save
      </Button>
    </Stack>
  );
}

/** What each cost center measured and billed in a month, beside what the providers actually charged. */
export default function Billing() {
  useTitle("Billing");
  const [month, setMonth] = useState("");
  const { data, isLoading, isError, error, refetch } = useAdminBilling(month);
  const shown = data?.month ?? month;

  const centerColumns: Column<AdminBillingCenterRow>[] = [
    {
      key: "center",
      header: "Cost center",
      render: (c) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {c.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {c.payer === "house" ? "House cost" : "Billed to people and communities"}
          </Typography>
        </Box>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      render: (c) => (
        <StatusChip label={c.status === "free" ? "Free" : "Metered"} tone={c.status === "free" ? "success" : "info"} />
      ),
    },
    { key: "usage", header: "Measured", width: 150, render: (c) => quantity(c.quantity, c.displayUnit) },
    {
      key: "people",
      header: "Billed to people",
      width: 140,
      align: "right",
      render: (c) => formatGems(c.billedPeople),
    },
    {
      key: "communities",
      header: "Billed to communities",
      width: 160,
      align: "right",
      render: (c) => formatGems(c.billedCommunities),
    },
    { key: "cost", header: "Costs us", width: 120, align: "right", render: (c) => formatGems(c.costGems) },
  ];

  const providerColumns: Column<AdminBillingProviderRow>[] = [
    { key: "provider", header: "Provider", render: (p) => p.label },
    { key: "estimate", header: "Meters say", width: 130, align: "right", render: (p) => formatGems(p.estimatedGems) },
    {
      key: "actual",
      header: "Invoice",
      width: 230,
      render: (p) => <ActualCost key={`${shown}:${p.provider}:${p.actualCents}`} row={p} month={shown} />,
    },
    {
      key: "actualGems",
      header: "Invoice in gems",
      width: 140,
      align: "right",
      render: (p) => (p.actualGems === null ? "Not entered" : formatGems(p.actualGems)),
    },
    {
      key: "margin",
      header: "Margin",
      width: 100,
      align: "right",
      render: (p) => (p.margin === null ? "—" : `${p.margin.toLocaleString("en-US", { maximumFractionDigits: 2 })}×`),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Billing"
        subtitle="What each kind of use measured and billed, beside what the providers actually charged"
        actions={
          data && (
            <TextField select size="small" label="Month" value={shown} onChange={(e) => setMonth(e.target.value)}>
              {data.months.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          )
        }
      />
      {isLoading && !data ? (
        <ListSkeleton rows={4} height={100} columns={{ xs: 2, md: 4 }} />
      ) : isError || !data ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load billing" onRetry={() => refetch()} />
      ) : (
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <StatusChip label="Charging" tone="info" />
            {data.everythingFree && <StatusChip label="Every cost center is free" tone="success" />}
            <StatusChip label={`Margin ${data.billingMargin}×`} />
            <StatusChip label={`${data.gemsPerDollar} gems = ${usd(100)}`} />
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
              gap: 2,
            }}
          >
            <StatCard
              label="Free allowance given"
              value={formatGems(data.totals.freeTierPeople + data.totals.freeTierCommunities)}
              note={`${formatGems(data.totals.freeTierCommunities)} to communities`}
            />
            <StatCard
              label="Due"
              value={formatWholeGems(data.totals.due)}
              note={`${data.totals.statements} statements`}
            />
            <StatCard label="Collected" value={formatWholeGems(data.totals.collected)} />
            <StatCard
              label="Unpaid"
              value={formatWholeGems(data.totals.unpaid)}
              valueTone={data.totals.unpaid > 0 ? "warning" : undefined}
            />
          </Box>

          <Box>
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Cost centers
            </Typography>
            <DataTable columns={centerColumns} rows={data.centers} rowKey={(c) => c.center} />
          </Box>

          <Box>
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
              Providers
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Enter each invoice for {shown} to check the rates: the margin is what people and communities were billed
              over what the provider charged.
            </Typography>
            <DataTable columns={providerColumns} rows={data.providers} rowKey={(p) => p.provider} />
          </Box>
        </Stack>
      )}
    </Box>
  );
}
