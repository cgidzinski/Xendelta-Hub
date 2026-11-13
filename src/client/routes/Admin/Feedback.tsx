import { useState } from "react";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, type AdminFeedback, type FeedbackStatus } from "@shared/feedback";
import GemAmount from "../../components/GemAmount";
import { GemIcon } from "../../components/icons/GemIcon";
import { GEM_COLOR } from "../../theme";
import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";
import ListSkeleton from "../../components/ui/ListSkeleton";
import ErrorDisplay from "../../components/ErrorDisplay";
import { cardSx } from "../../components/ui/surfaceStyles";
import { useTitle } from "../../hooks/useTitle";
import { useAdminFeedback, useUpdateFeedback } from "../../hooks/admin/useAdminData";
import { Pager } from "./components/DataTable";
import RewardFeedbackDialog from "./components/RewardFeedbackDialog";
import FilterChips from "./components/FilterChips";
import StatusChip, { type Tone } from "./components/StatusChip";
import { dateTime } from "./adminFormat";

const TONE: Record<FeedbackStatus, Tone> = { new: "info", seen: "default", done: "success" };

function FeedbackCard({ item }: { item: AdminFeedback }) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateFeedback();
  const [rewarding, setRewarding] = useState(false);
  const set = (status: FeedbackStatus) =>
    update.mutate(
      { id: item._id, status },
      { onError: (e) => enqueueSnackbar((e as Error).message || "Couldn't update that", { variant: "error" }) },
    );
  return (
    <Card variant="outlined" sx={{ ...cardSx, p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
        <StatusChip label={FEEDBACK_STATUS_LABEL[item.status]} tone={TONE[item.status]} />
        <Typography variant="body2" color="text.secondary">
          from {item.from.username} · {dateTime(item.createdAt)}
        </Typography>
      </Stack>
      <Typography sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.message}</Typography>
      <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        {item.status !== "seen" && item.status !== "done" && (
          <Button size="small" disabled={update.isPending} onClick={() => set("seen")}>
            Mark seen
          </Button>
        )}
        {item.status !== "done" ? (
          <Button size="small" variant="outlined" disabled={update.isPending} onClick={() => set("done")}>
            Mark done
          </Button>
        ) : (
          <Button size="small" disabled={update.isPending} onClick={() => set("new")}>
            Reopen
          </Button>
        )}
        {item.rewardedGems ? (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, ml: "auto" }}>
            <Typography variant="body2" color="text.secondary">
              Rewarded
            </Typography>
            <GemAmount amount={item.rewardedGems} iconSize={16} variant="body2" />
          </Box>
        ) : (
          <Button
            size="small"
            variant="outlined"
            startIcon={<GemIcon sx={{ color: GEM_COLOR }} />}
            onClick={() => setRewarding(true)}
            sx={{ ml: "auto" }}
          >
            Reward gems
          </Button>
        )}
      </Box>
      <RewardFeedbackDialog item={item} open={rewarding} onClose={() => setRewarding(false)} />
    </Card>
  );
}

/** What people sent from "Send feedback", newest first, with a status to keep track of what has been dealt with. */
export default function Feedback() {
  useTitle("Feedback");
  const [status, setStatus] = useState<FeedbackStatus | "">("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useAdminFeedback(status, page);

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
            { value: "" as FeedbackStatus | "", label: "All" },
            ...FEEDBACK_STATUSES.map((s) => ({ value: s as FeedbackStatus | "", label: FEEDBACK_STATUS_LABEL[s] })),
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
              <FeedbackCard key={item._id} item={item} />
            ))}
          </Stack>
          {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </>
      )}
    </Box>
  );
}
