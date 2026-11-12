import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, InputAdornment, Link, MenuItem, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { AUDIT_CATEGORIES, type AuditCategory, type AuditEntry } from "@shared/admin";
import PageHeader from "../../components/ui/PageHeader";
import ErrorDisplay from "../../components/ErrorDisplay";
import { useTitle } from "../../hooks/useTitle";
import { useAdminAudit } from "../../hooks/admin/useAdminData";
import DataTable, { Pager, type Column } from "./components/DataTable";
import FilterChips from "./components/FilterChips";
import StatusChip, { type Tone } from "./components/StatusChip";
import { dateTime } from "./adminFormat";

const TONE: Record<AuditCategory, Tone> = {
  Roles: "info",
  Storage: "success",
  Gems: "warning",
  Items: "default",
  Notify: "info",
  Danger: "error",
  System: "default",
};
const RANGES = [
  { value: 1, label: "Last 24 hours" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 365, label: "Last year" },
];

/** Everything an admin changed: who, what, to whom. Read-only; entries can't be edited or deleted. */
export default function Audit() {
  useTitle("Audit log");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const { data, isLoading, isError, error, refetch } = useAdminAudit({ category, q, days, page });

  const columns: Column<AuditEntry>[] = [
    {
      key: "when",
      header: "When",
      width: 190,
      render: (e) => (
        <Typography variant="body2" color="text.secondary">
          {dateTime(e.createdAt)}
        </Typography>
      ),
    },
    { key: "admin", header: "Admin", width: 120, render: (e) => e.admin.username },
    {
      key: "action",
      header: "Action",
      width: 120,
      render: (e) => <StatusChip label={e.category} tone={TONE[e.category]} />,
    },
    {
      key: "target",
      header: "Person or thing",
      render: (e) =>
        e.target.type === "user" && e.target.id ? (
          <Link component={RouterLink} to={`/admin/users/${e.target.id}`} underline="hover" color="text.primary">
            {e.target.label}
          </Link>
        ) : (
          e.target.label
        ),
    },
    { key: "detail", header: "What changed", render: (e) => <Typography variant="body2">{e.detail}</Typography> },
  ];

  return (
    <Box>
      <PageHeader
        title="Audit log"
        subtitle="Everything an admin changed: who, what, to whom. Entries can't be edited or deleted."
      />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search the log"
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{ width: { xs: "100%", sm: 300 } }}
            slotProps={{
              htmlInput: { "aria-label": "Search the log" },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            select
            size="small"
            label="Time"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setPage(1);
            }}
            sx={{ minWidth: 160 }}
          >
            {RANGES.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <FilterChips
          label="Category"
          value={category}
          onChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
          options={[
            { value: "" as AuditCategory | "", label: "All" },
            ...AUDIT_CATEGORIES.map((c) => ({ value: c as AuditCategory | "", label: c })),
          ]}
        />
      </Box>
      {isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load the log" onRetry={() => refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.items}
            rowKey={(e) => e._id}
            loading={isLoading}
            emptyTitle="No entries"
            emptyDescription="Nothing matches those filters."
          />
          {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </>
      )}
    </Box>
  );
}
