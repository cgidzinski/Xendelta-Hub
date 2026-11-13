import { useState } from "react";
import { Box, Card, CardActionArea, Stack, Typography } from "@mui/material";
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
import { dateTime } from "./adminFormat";

const TONE: Record<FeedbackStatus, Tone> = { new: "info", seen: "info", done: "success", archived: "default" };
// "Open" (the default) is what is new; "seen" is no longer set by anything, and older items with it count as open.
const FILTERS = FEEDBACK_STATUSES.filter((s) => s === "done" || s === "archived");

/** A feedback in the list. Click it to open it and decide what to do. */
function FeedbackCard({ item, onOpen }: { item: AdminFeedback; onOpen: () => void }) {
  return (
    <Card variant="outlined" sx={{ ...cardSx }}>
      <CardActionArea onClick={onOpen} sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
          <StatusChip label={FEEDBACK_STATUS_LABEL[item.status]} tone={TONE[item.status]} />
          <Typography variant="body2" color="text.secondary">
            from {item.from.username} · {dateTime(item.createdAt)}
          </Typography>
          {item.rewardedGems ? <GemAmount amount={item.rewardedGems} iconSize={16} variant="body2" /> : null}
        </Stack>
        <Typography
          sx={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.message}
        </Typography>
      </CardActionArea>
    </Card>
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
      <PageHeader title="Feedback" subtitle={data ? `${data.newCount} new` : "What people sent from Send feedback."} />
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
          <Stack spacing={1.5}>
            {data?.items.map((item) => (
              <FeedbackCard key={item._id} item={item} onOpen={() => setOpenId(item._id)} />
            ))}
          </Stack>
          {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </>
      )}
      {opened && <FeedbackDialog item={opened} onClose={() => setOpenId(null)} />}
    </Box>
  );
}
