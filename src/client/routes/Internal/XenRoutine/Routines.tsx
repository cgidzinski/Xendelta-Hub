import { useMemo, useState } from "react";
import { Box, Button, Card, Chip, InputAdornment, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import GroupIcon from "@mui/icons-material/Group";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useOutletContext } from "react-router-dom";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { intervalLabel, readingText, thresholdLabel, useRoutines } from "../../../hooks/xenroutine/useRoutines";
import RoutineMenu from "./components/RoutineMenu";
import type { XenRoutineOutletContext } from "./outletContext";

/** The base routine definitions: every routine, whatever its due date, paused ones included. */
export default function Routines() {
  const { openCreate, openEdit, openDuplicate } = useOutletContext<XenRoutineOutletContext>();
  const { routines, isLoading, isError, error, refetch } = useRoutines();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = useMemo(() => routines.filter((r) => r.archived).length, [routines]);
  const categories = useMemo(
    () => [...new Set(routines.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [routines],
  );
  // A category nobody uses any more (the last routine in it was edited or deleted) stops filtering.
  const activeCategory = category && categories.includes(category) ? category : null;
  const visible = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return routines.filter(
      (r) =>
        (showArchived || !r.archived) &&
        (!activeCategory || r.category === activeCategory) &&
        words.every((w) => `${r.name} ${r.category} ${r.notes}`.toLowerCase().includes(w)),
    );
  }, [routines, search, activeCategory, showArchived]);

  if (isLoading) return <ListSkeleton rows={4} height={96} />;
  if (isError) return <ErrorDisplay error={error as Error} onRetry={() => refetch()} />;
  if (routines.length === 0) {
    return (
      <EmptyState
        icon={<EventRepeatIcon />}
        title="No routines yet"
        description="Add things you do on a schedule — filters, oil changes, smoke alarm batteries."
        action={
          <Button variant="contained" onClick={openCreate}>
            Add your first routine
          </Button>
        }
      />
    );
  }

  return (
    <Stack spacing={1.5}>
      <TextField
        size="small"
        placeholder="Search routines"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          htmlInput: { "aria-label": "Search routines" },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
      />
      {(categories.length > 0 || archivedCount > 0) && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" aria-label="Filter by category">
          {categories.map((c) => (
            <Chip
              key={c}
              label={c}
              color={activeCategory === c ? "primary" : "default"}
              variant={activeCategory === c ? "filled" : "outlined"}
              onClick={() => setCategory(activeCategory === c ? null : c)}
            />
          ))}
          {archivedCount > 0 && (
            <Chip
              label={`Archived (${archivedCount})`}
              color={showArchived ? "primary" : "default"}
              variant={showArchived ? "filled" : "outlined"}
              onClick={() => setShowArchived((v) => !v)}
            />
          )}
        </Stack>
      )}
      {visible.length === 0 && (
        <EmptyState
          icon={<EventRepeatIcon />}
          title="No routines match"
          description="Try another search or category."
        />
      )}
      {visible.map((r) => (
        <Card key={r._id} variant="outlined" sx={{ p: 2, opacity: r.enabled ? 1 : 0.6 }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                  {r.name}
                </Typography>
                {r.archived ? (
                  <Chip size="small" label="Archived" />
                ) : (
                  !r.enabled && <Chip size="small" label="Paused" />
                )}
                {r.category && <Chip size="small" label={r.category} />}
                {r.members.length > 1 && (
                  <Tooltip title={`Shared with ${r.members.map((m) => m.username).join(", ")}`}>
                    <GroupIcon fontSize="small" color="action" />
                  </Tooltip>
                )}
                {r.my_notifications?.muted && (
                  <Tooltip title="Muted">
                    <NotificationsOffIcon fontSize="small" color="action" />
                  </Tooltip>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {r.kind === "threshold" && r.threshold
                  ? `${thresholdLabel(r.threshold)} · now ${readingText(r.threshold.current_value, r.threshold.unit)}, due at ${readingText(r.threshold.target, r.threshold.unit)}`
                  : intervalLabel(r.interval)}
                {r.kind !== "threshold" && r.enabled ? ` · next due ${format(new Date(r.due_at), "PP")}` : ""}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {r.last_done_at
                  ? `Last done ${formatDistanceToNowStrict(new Date(r.last_done_at), { addSuffix: true })}`
                  : "Never marked done"}
              </Typography>
            </Box>
            <RoutineMenu routine={r} variant="routines" onEdit={openEdit} onDuplicate={openDuplicate} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
