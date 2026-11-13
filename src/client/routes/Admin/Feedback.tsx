import { useState } from "react";
import { Avatar, Box, Card, ListItemButton, Stack, Typography } from "@mui/material";
import { FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, type AdminFeedback, type FeedbackStatus } from "@shared/feedback";
import GemAmount from "../../components/GemAmount";
import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";
import ListSkeleton from "../../components/ui/ListSkeleton";
import ErrorDisplay from "../../components/ErrorDisplay";
import { cardSx } from "../../components/ui/surfaceStyles";
import { useTitle } from "../../hooks/useTitle";
import { useAdminFeedback } from "../../hooks/admin/useAdminData";
import { Pager } from "./components/DataTable";
import FeedbackDialog from "./components/FeedbackDialog";
import FilterChips from "./components/FilterChips";
import StatusChip, { type Tone } from "./components/StatusChip";
import { timeAgo } from "./adminFormat";

const TONE: Record<FeedbackStatus, Tone> = {
  new: "info",
  seen: "info",
  done: "success",
  dismissed: "default",
  archived: "default",
};
// "Open" (the default) is what still needs a decision; "seen" is no longer set by anything and counts as open.
const FILTERS = FEEDBACK_STATUSES.filter((s) => s === "done" || s === "dismissed" || s === "archived");

/** One feedback in the list: who, when, the message (three lines, the rest is in the modal) and where it stands. */
function FeedbackRow({ item, onOpen }: { item: AdminFeedback; onOpen: () => void }) {
  const isOpen = item.status === "new" || item.status === "seen";
  return (
    <ListItemButton
      onClick={onOpen}
      alignItems="flex-start"
      sx={{
        gap: 2,
        px: { xs: 2, sm: 2.5 },
        py: 2,
        "&:not(:last-of-type)": { borderBottom: 1, borderColor: "divider" },
      }}
    >
      <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", fontSize: 16, mt: 0.25 }}>
        {(item.from.username || "?").charAt(0).toUpperCase()}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap", mb: 0.5 }}>
          {isOpen && (
            <Box
              role="img"
              aria-label="Needs a decision"
              sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flex: "none" }}
            />
          )}
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {item.from.username}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {timeAgo(item.createdAt)}
          </Typography>
          <Box sx={{ ml: "auto !important", display: "flex", alignItems: "center", gap: 1 }}>
            {item.rewardedGems ? <GemAmount amount={item.rewardedGems} iconSize={16} variant="body2" /> : null}
            <StatusChip label={FEEDBACK_STATUS_LABEL[item.status]} tone={TONE[item.status]} />
          </Box>
        </Stack>
        <Typography
          sx={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.message}
        </Typography>
      </Box>
    </ListItemButton>
  );
}

/** What people sent from "Send feedback", newest first, with a status to keep track of what has been dealt with. */
export default function Feedback() {
  useTitle("Feedback");
  const [status, setStatus] = useState<FeedbackStatus | "">("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useAdminFeedback(status, page);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = data?.items.find((i) => i._id === openId);

  return (
    <Box>
      <PageHeader
        title="Feedback"
        subtitle={data ? `${data.newCount} need a decision` : "What people sent from Send feedback."}
      />
      <Box sx={{ mb: 2 }}>
        <FilterChips
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "" as FeedbackStatus | "", label: "Open" },
            ...FILTERS.map((s) => ({ value: s as FeedbackStatus | "", label: FEEDBACK_STATUS_LABEL[s] })),
          ]}
        />
      </Box>
      {isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load feedback" onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton rows={3} height={110} />
      ) : data && data.items.length === 0 ? (
        <EmptyState title="Nothing here" description={status ? "No feedback with that status." : "No feedback yet."} />
      ) : (
        <>
          <Card variant="outlined" sx={{ ...cardSx, p: 0, overflow: "hidden" }}>
            {data?.items.map((item) => (
              <FeedbackRow key={item._id} item={item} onOpen={() => setOpenId(item._id)} />
            ))}
          </Card>
          {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </>
      )}
      {opened && <FeedbackDialog item={opened} onClose={() => setOpenId(null)} />}
    </Box>
  );
}
