import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, Box, InputAdornment, LinearProgress, MenuItem, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { AdminUserRow, UserFilter, UserSort } from "@shared/admin";
import PageHeader from "../../components/ui/PageHeader";
import ErrorDisplay from "../../components/ErrorDisplay";
import UserName from "../../components/user/UserName";
import { useTitle } from "../../hooks/useTitle";
import { useAdminUserList } from "../../hooks/admin/useAdminData";
import { formatFileSize } from "../../utils/fileUtils";
import DataTable, { Pager, type Column } from "./components/DataTable";
import FilterChips from "./components/FilterChips";
import StatusChip from "./components/StatusChip";
import { shortDate, share } from "./adminFormat";

const FILTERS: Array<{ value: UserFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "admins", label: "Admins" },
  { value: "near_quota", label: "Near storage limit" },
  { value: "buyers", label: "Has bought gems" },
  { value: "new", label: "Joined this week" },
];
const SORTS: Array<{ value: UserSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "storage", label: "Most storage used" },
];

/** The people list: search, filter, sort and page on the server; a row opens that person's page. */
export default function Users() {
  useTitle("Users");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(text);
  const filter = (params.get("filter") as UserFilter) || "all";
  const sort = (params.get("sort") as UserSort) || "newest";
  const page = Number(params.get("page")) || 1;

  // Typing waits a moment before it searches.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const set = (change: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(change)) {
      if (v && v !== "all" && v !== "newest" && v !== "1") next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if (q !== (params.get("q") ?? "")) set({ q, page: "1" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, isLoading, isError, error, refetch } = useAdminUserList({ q, filter, sort, page });

  const columns: Column<AdminUserRow>[] = [
    {
      key: "person",
      header: "Person",
      render: (u) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <Avatar src={u.avatar} sx={{ width: 36, height: 36 }}>
            {u.username[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500 }} noWrap>
              <UserName user={u} />
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {u.email}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      key: "role",
      header: "Role",
      width: 110,
      render: (u) => (
        <StatusChip
          label={u.roles.includes("admin") ? "Admin" : "User"}
          tone={u.roles.includes("admin") ? "error" : "default"}
        />
      ),
    },
    {
      key: "storage",
      header: "Storage",
      width: 220,
      render: (u) => {
        const used = share(u.storage.used, u.storage.allowed);
        return (
          <Box sx={{ minWidth: 120 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, used * 100)}
              color={used >= 0.9 ? "warning" : "primary"}
              sx={{ height: 6, borderRadius: 3 }}
            />
            <Typography variant="caption" color={used >= 0.9 ? "warning.main" : "text.secondary"}>
              {formatFileSize(u.storage.used)} of {formatFileSize(u.storage.allowed)}
            </Typography>
          </Box>
        );
      },
    },
    { key: "gems", header: "Gems", width: 100, render: (u) => u.gems.toLocaleString() },
    {
      key: "joined",
      header: "Joined",
      width: 130,
      render: (u) => (
        <Typography variant="body2" color="text.secondary">
          {shortDate(u.joinedAt)}
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle={
          data ? `${data.total.toLocaleString()} ${data.total === 1 ? "person" : "people"}` : "Everyone with an account"
        }
      />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search name or email"
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{ width: { xs: "100%", sm: 340 } }}
            slotProps={{
              htmlInput: { "aria-label": "Search people" },
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
            value={sort}
            onChange={(e) => set({ sort: e.target.value, page: "1" })}
            label="Sort"
            sx={{ minWidth: 190, width: { xs: "100%", sm: "auto" } }}
          >
            {SORTS.map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <FilterChips label="Filter" options={FILTERS} value={filter} onChange={(v) => set({ filter: v, page: "1" })} />
      </Box>

      {isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load people" onRetry={() => refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.items}
            rowKey={(u) => u._id}
            loading={isLoading}
            onRowClick={(u) => navigate(`/admin/users/${u._id}`)}
            emptyTitle="No one matches"
            emptyDescription="Try a different search or filter."
          />
          {data && (
            <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />
          )}
        </>
      )}
    </Box>
  );
}
