import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Avatar, Box, Link, Typography } from "@mui/material";
import PageHeader from "../../components/ui/PageHeader";
import ErrorDisplay from "../../components/ErrorDisplay";
import ListSkeleton from "../../components/ui/ListSkeleton";
import { useTitle } from "../../hooks/useTitle";
import { useAdminStorage } from "../../hooks/admin/useAdminData";
import { formatFileSize } from "../../utils/fileUtils";
import DataTable, { type Column } from "./components/DataTable";
import FilterChips from "./components/FilterChips";
import StatCard from "./components/StatCard";
import { share } from "./adminFormat";
import type { AdminStorageReport } from "@shared/admin";

const card = { border: 1, borderColor: "divider", borderRadius: 2, p: 2.25 } as const;
type Person = AdminStorageReport["top"][number];

/** What people have stored, where it is, and who holds the most. */
export default function Storage() {
  useTitle("Storage");
  const [by, setBy] = useState<"size" | "percent">("size");
  const { data, isLoading, isError, error, refetch } = useAdminStorage(by);

  const columns: Column<Person>[] = [
    {
      key: "person",
      header: "Person",
      render: (p) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Avatar src={p.avatar} sx={{ width: 30, height: 30 }}>
            {p.username[0]?.toUpperCase()}
          </Avatar>
          <Link component={RouterLink} to={`/admin/users/${p._id}`} underline="hover" color="text.primary">
            {p.username}
          </Link>
        </Box>
      ),
    },
    {
      key: "used",
      header: "Used",
      width: "45%",
      render: (p) => {
        const near = share(p.used, p.allowed) >= 0.9;
        const mine = Math.min(100, ((p.used - p.appBytes) / p.allowed) * 100);
        const apps = Math.min(100 - mine, (p.appBytes / p.allowed) * 100);
        return (
          <Box sx={{ minWidth: 160 }}>
            <Box sx={{ display: "flex", height: 8, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}>
              <Box sx={{ width: `${mine}%`, bgcolor: near ? "warning.main" : "primary.main" }} />
              <Box sx={{ width: `${apps}%`, bgcolor: "info.main" }} />
            </Box>
            <Typography variant="caption" color={near ? "warning.main" : "text.secondary"}>
              {formatFileSize(p.used)} of {formatFileSize(p.allowed)}
            </Typography>
          </Box>
        );
      },
    },
    { key: "files", header: "Files", width: 90, render: (p) => p.files.toLocaleString() },
    {
      key: "act",
      header: "",
      width: 110,
      align: "right",
      render: (p) => (
        <Link component={RouterLink} to={`/admin/users/${p._id}`} underline="hover" variant="body2">
          Add space
        </Link>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader title="Storage" subtitle="What people have stored, and where it is" />
      {isLoading ? (
        <ListSkeleton rows={4} height={100} />
      ) : isError || !data ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load storage" onRetry={() => refetch()} />
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
            <StatCard label="Used" value={formatFileSize(data.used)} note="across everyone" />
            <StatCard
              label="Granted on top of free"
              value={formatFileSize(data.extraGranted)}
              note="vouchers and admin grants"
            />
            <StatCard
              label="Over 90% of their space"
              value={data.nearQuota}
              valueTone={data.nearQuota > 0 ? "warning" : undefined}
              note="people"
            />
            <StatCard
              label="From apps"
              value={formatFileSize(data.byApp.filter((a) => a.key !== "drive").reduce((n, a) => n + a.bytes, 0))}
              note="chat attachments and other apps"
            />
          </Box>

          <Box
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.6fr) minmax(0, 1fr)" }, gap: 2 }}
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
                <Typography sx={{ fontWeight: 600 }}>Largest drives</Typography>
                <FilterChips
                  label="Order"
                  value={by}
                  onChange={setBy}
                  options={[
                    { value: "size", label: "By size" },
                    { value: "percent", label: "By % of limit" },
                  ]}
                />
              </Box>
              <DataTable columns={columns} rows={data.top} rowKey={(p) => p._id} />
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={card}>
                <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Where it is</Typography>
                <Box
                  sx={{
                    display: "flex",
                    height: 14,
                    borderRadius: 7,
                    overflow: "hidden",
                    bgcolor: "action.hover",
                    mb: 1.5,
                  }}
                >
                  {data.byApp.map((a) => (
                    <Box
                      key={a.key}
                      sx={{
                        width: `${data.used > 0 ? (a.bytes / data.used) * 100 : 0}%`,
                        bgcolor: a.key === "drive" ? "primary.main" : "info.main",
                      }}
                    />
                  ))}
                </Box>
                {data.byApp.map((a) => (
                  <Box key={a.key} sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 0.75 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: 0.5,
                        bgcolor: a.key === "drive" ? "primary.main" : "info.main",
                      }}
                    />
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {a.key === "drive" ? a.label : `From apps · ${a.label}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatFileSize(a.bytes)}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{ ...card, borderStyle: "dashed" }}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Stored but not counted</Typography>
                <Typography variant="body2" color="text.secondary">
                  Photos in XenSplit, XenBudget, XenNote and XenKitchen go straight to cloud storage and count for
                  nobody. They cost money and are not in the numbers here. See docs/storage.md.
                </Typography>
              </Box>

              <Box sx={card}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Housekeeping</Typography>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    py: 0.75,
                    borderTop: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2">Abandoned uploads waiting to be cleaned</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {data.housekeeping.abandonedUploads}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    py: 0.75,
                    borderTop: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2">Files whose owner no longer exists</Typography>
                  <Typography
                    variant="body2"
                    color={data.housekeeping.orphanedFiles > 0 ? "warning.main" : "success.main"}
                  >
                    {data.housekeeping.orphanedFiles}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
