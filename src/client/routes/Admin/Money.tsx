import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Link, Typography } from "@mui/material";
import type { AdminPurchase, PurchaseStatus } from "@shared/admin";
import { formatMoney } from "@shared/money";
import PageHeader from "../../components/ui/PageHeader";
import ErrorDisplay from "../../components/ErrorDisplay";
import ListSkeleton from "../../components/ui/ListSkeleton";
import { useTitle } from "../../hooks/useTitle";
import { useAdminMoney } from "../../hooks/admin/useAdminData";
import DataTable, { Pager, type Column } from "./components/DataTable";
import FilterChips from "./components/FilterChips";
import StatCard from "./components/StatCard";
import StatusChip, { type Tone } from "./components/StatusChip";
import { timeAgo } from "./adminFormat";

const card = { border: 1, borderColor: "divider", borderRadius: 2, p: 2.25 } as const;
const TONE: Record<PurchaseStatus, Tone> = { completed: "success", pending: "warning", failed: "error" };
const STATUS_LABEL: Record<PurchaseStatus, string> = { completed: "Completed", pending: "Pending", failed: "Failed" };
type Filter = "" | PurchaseStatus;

/** Every gem pack bought, and what the shop sells. Read-only: money and refunds are handled at the payment provider. */
export default function Money() {
  useTitle("Shop and payments");
  const [status, setStatus] = useState<Filter>("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useAdminMoney(status, page);

  const columns: Column<AdminPurchase>[] = [
    {
      key: "when",
      header: "When",
      width: 140,
      render: (p) => (
        <Typography variant="body2" color="text.secondary">
          {timeAgo(p.createdAt)}
        </Typography>
      ),
    },
    {
      key: "person",
      header: "Person",
      render: (p) =>
        p.user ? (
          <Link component={RouterLink} to={`/admin/users/${p.user._id}`} underline="hover" color="text.primary">
            {p.user.username}
          </Link>
        ) : (
          <Typography variant="body2" color="text.disabled">
            Deleted account
          </Typography>
        ),
    },
    { key: "pack", header: "Pack", render: (p) => `${p.gems.toLocaleString("en-US")} gems` },
    {
      key: "amount",
      header: "Amount",
      width: 110,
      render: (p) => formatMoney(p.amountCents / 100, p.currency, { symbol: "narrow" }),
    },
    {
      key: "provider",
      header: "Provider",
      width: 100,
      render: (p) => (
        <Typography variant="body2" color="text.secondary">
          {p.provider}
        </Typography>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 130,
      render: (p) => <StatusChip label={STATUS_LABEL[p.status]} tone={TONE[p.status]} />,
    },
  ];

  const summary = data?.summary;
  const stuck = summary?.oldestPendingMinutes != null && summary.oldestPendingMinutes >= 60;

  return (
    <Box>
      <PageHeader title="Shop and payments" subtitle="Every gem pack bought, and what the shop sells" />
      {isLoading && !data ? (
        <ListSkeleton rows={4} height={100} />
      ) : isError || !data || !summary ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load payments" onRetry={() => refetch()} />
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
              label="Revenue (30 days)"
              value={formatMoney(summary.cents30 / 100, "USD", { symbol: "narrow" })}
              note="before provider fees"
            />
            <StatCard
              label="Gems sold"
              value={summary.gems30.toLocaleString()}
              note={`${summary.purchases30} purchases`}
            />
            <StatCard
              label="Pending"
              value={summary.pending}
              valueTone={summary.pending > 0 ? "warning" : undefined}
              note={
                summary.oldestPendingMinutes != null
                  ? `oldest ${Math.max(1, Math.round(summary.oldestPendingMinutes / 60))} h`
                  : "none waiting"
              }
            />
            <StatCard label="Failed" value={summary.failed30} note="last 30 days" />
          </Box>

          {stuck && (
            <Box sx={{ border: 1, borderColor: "warning.main", borderRadius: 2, p: 2, mb: 2 }}>
              <Typography sx={{ fontWeight: 600 }}>A purchase is stuck</Typography>
              <Typography variant="body2" color="text.secondary">
                A purchase has been pending for over an hour. Check the payment provider before crediting anything by
                hand; a correction goes through the person's page.
              </Typography>
            </Box>
          )}

          <Box
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.8fr) minmax(0, 1fr)" }, gap: 2 }}
          >
            <Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1.5,
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Typography sx={{ fontWeight: 600 }}>Purchases</Typography>
                <FilterChips
                  label="Status"
                  value={status}
                  onChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                  options={[
                    { value: "", label: "All" },
                    { value: "completed", label: "Completed" },
                    { value: "pending", label: "Pending" },
                    { value: "failed", label: "Failed" },
                  ]}
                />
              </Box>
              <DataTable
                columns={columns}
                rows={data.purchases.items}
                rowKey={(p) => p._id}
                emptyTitle="No purchases"
              />
              <Pager page={page} pageSize={data.purchases.pageSize} total={data.purchases.total} onPage={setPage} />
            </Box>

            <Box sx={card}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
                <Typography sx={{ fontWeight: 600 }}>Shop catalogue</Typography>
                <Typography variant="caption" color="text.disabled">
                  Read-only
                </Typography>
              </Box>
              {data.catalogue.map((c) => (
                <Box
                  key={c.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    py: 1.25,
                    borderTop: 1,
                    borderColor: "divider",
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2">{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.kind}
                    </Typography>
                  </Box>
                  <Typography variant="body2">{c.price}</Typography>
                </Box>
              ))}
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
                Items live in code (constants/shopItems.ts); prices change with a deploy.
              </Typography>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
