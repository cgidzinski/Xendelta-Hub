import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Collapse,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import type { AxiosProgressEvent } from "axios";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useSnackbar } from "notistack";
import { useOutletContext } from "react-router-dom";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import {
  intervalLabel,
  useCompleteRoutine,
  useInvalidateRoutines,
  useRoutines,
  useToggleChecklistItem,
} from "../../../hooks/xenroutine/useRoutines";
import {
  bucketForDate,
  checklistProgress,
  stepsLabel,
  DEFAULT_HORIZON_DAYS,
  dueText,
  HORIZON_OPTIONS,
  pendingOccurrences,
  recentCompletions,
  type Bucket,
  type Occurrence,
} from "../../../hooks/xenroutine/routineViews";
import { useLocalStorageState } from "../../../hooks/useLocalStorageState";
import { useAuth } from "../../../contexts/AuthContext";
import { isNetworkError } from "../../../offline/offlineQueue";
import { offlineQueue, useQueuedDoneKeys } from "../../../offline/offlineRuntime";
import CompleteDialog from "./components/CompleteDialog";
import SlideToComplete from "./components/SlideToComplete";
import AddAPhotoOutlinedIcon from "@mui/icons-material/AddAPhotoOutlined";
import RoutineMenu from "./components/RoutineMenu";
import type { XenRoutineOutletContext } from "./outletContext";

type Filter = "pending" | "completed" | "all";

const BUCKETS: { bucket: Exclude<Bucket, "later">; title: string }[] = [
  { bucket: "overdue", title: "Overdue" },
  { bucket: "soon", title: "Due soon" },
  { bucket: "month", title: "Later this month" },
];

// How long the exit animation runs before the list is refetched; must cover Collapse's timeout.
const EXIT_MS = 350;

function PendingCard({ occ, userId }: { occ: Occurrence; userId?: string }) {
  const { routine, index, date } = occ;
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const complete = useCompleteRoutine();
  const invalidate = useInvalidateRoutines();
  const [leaving, setLeaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const projected = index > 1;

  // Each occurrence is its own completion. Resolves once the server has recorded it, then
  // the card collapses and only afterwards is the list refetched, so the slid handle stays
  // put until the card is gone. Rejects on failure so the slider springs back.
  const toggleStep = useToggleChecklistItem();
  // The steps belong to the occurrence that is due now, so only that card shows them.
  const steps = projected ? [] : routine.checklist;
  const progress = checklistProgress(steps);
  const unticked = progress.total - progress.done;

  // Mark this occurrence done, with a note and photos when they were added in the dialog. Resolves once the server has
  // recorded it. Rejects on failure (so the slider springs back, or the dialog stays open), with a message shown.
  const handleComplete = async (
    extra: { note?: string; images?: File[]; onUploadProgress?: (e: AxiosProgressEvent) => void } = {},
  ) => {
    // Some steps not ticked: ask first. Cancelling rejects, so the slider springs back without an error message.
    if (unticked > 0) {
      const ok = await confirm({
        title: "Some steps aren't ticked",
        message: `${unticked} of ${progress.total} ${progress.total === 1 ? "step isn't" : "steps aren't"} ticked off on “${routine.name}”. Mark it as done anyway?`,
        confirmLabel: "Mark as done",
        destructive: false,
      });
      if (!ok) throw new Error("cancelled");
    }
    try {
      await complete.mutateAsync({ id: routine._id, occurrence: index, expected_due_at: routine.due_at, ...extra });
    } catch (e: any) {
      // No connection: keep a plain "done" on the device and send it when back online (the server checks the due date then).
      // One with a note or photos needs a connection, so it fails as usual. The card disappears because the list hides
      // queued occurrences.
      if (userId && isNetworkError(e) && !extra.note && !extra.images?.length) {
        await offlineQueue.add(
          userId,
          { kind: "routine-done", routineId: routine._id, occurrence: index, expectedDueAt: routine.due_at },
          `Mark “${routine.name}” as done`,
        );
        enqueueSnackbar(`“${routine.name}” marked as done. It will be saved when you're back online.`, {
          variant: "info",
        });
        return;
      }
      enqueueSnackbar(e?.response?.data?.message ?? e?.message ?? "Couldn't mark as done", { variant: "error" });
      if (e?.response?.status === 409) void invalidate();
      throw e;
    }
    enqueueSnackbar(`“${routine.name}” marked as done`, { variant: "success" });
    setLeaving(true);
    // A timer rather than onExited so the refetch still happens if the user navigates away.
    setTimeout(() => {
      void invalidate();
    }, EXIT_MS);
  };

  return (
    <Collapse in={!leaving} timeout={EXIT_MS - 50} unmountOnExit>
      <Card variant="outlined" sx={{ p: 2, mb: 1.5 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
              {routine.name}
            </Typography>
            <Typography variant="body2" color={bucketForDate(date) === "overdue" ? "error.main" : "text.secondary"}>
              {dueText(date)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {intervalLabel(routine.interval)}
              {!projected &&
                ` · ${
                  routine.last_done_at
                    ? `last done ${formatDistanceToNowStrict(new Date(routine.last_done_at), { addSuffix: true })}`
                    : "never marked done"
                }`}
              {projected && " · upcoming"}
            </Typography>
          </Box>
          <RoutineMenu routine={routine} variant="overview" allowPostpone={!projected} />
        </Stack>
        {steps.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {stepsLabel(progress.done, progress.total)} ticked
            </Typography>
            {steps.map((step) => (
              <Box
                key={step._id}
                component="label"
                sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer" }}
              >
                <Checkbox
                  size="small"
                  checked={step.done}
                  onChange={(e) =>
                    toggleStep.mutate(
                      { id: routine._id, itemId: step._id, done: e.target.checked },
                      { onError: () => enqueueSnackbar("Couldn't save the step", { variant: "error" }) },
                    )
                  }
                  sx={{ p: 0.5 }}
                />
                <Typography
                  variant="body2"
                  sx={{ textDecoration: step.done ? "line-through" : "none", opacity: step.done ? 0.6 : 1 }}
                >
                  {step.text}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        <Box sx={{ mt: 1.5 }}>
          <SlideToComplete
            onComplete={() => handleComplete()}
            onKeyboardActivate={async () => {
              // With steps left unticked, handleComplete asks about that instead, so there is only one question.
              if (unticked > 0) {
                handleComplete().catch(() => {});
                return;
              }
              if (
                await confirm({
                  title: "Mark as done",
                  message: `Mark “${routine.name}” (${format(date, "PP")}) as done?`,
                  confirmLabel: "Done",
                  destructive: false,
                })
              ) {
                handleComplete().catch(() => {});
              }
            }}
          />
        </Box>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
          <Button
            size="small"
            startIcon={<AddAPhotoOutlinedIcon />}
            onClick={() => setNoteOpen(true)}
            sx={{ textTransform: "none" }}
          >
            Done with a note or photos
          </Button>
        </Box>
        <CompleteDialog
          open={noteOpen}
          routineName={routine.name}
          onClose={() => setNoteOpen(false)}
          onSubmit={async ({ note, files, onUploadProgress }) => {
            await handleComplete({ note: note || undefined, images: files, onUploadProgress });
            setNoteOpen(false);
          }}
        />
      </Card>
    </Collapse>
  );
}

export default function Overview() {
  const { openCreate } = useOutletContext<XenRoutineOutletContext>();
  const { routines, isLoading, isError, error, refetch } = useRoutines();
  const { user } = useAuth();
  // The three view settings are remembered per browser (localStorage), and a stored value
  // is only used if it is still one of the choices on offer.
  const [filter, setFilter] = useLocalStorageState<Filter>(
    "xenroutine:overview:filter",
    "pending",
    (v): v is Filter => v === "all" || v === "pending" || v === "completed",
  );
  const [horizonDays, setHorizonDays] = useLocalStorageState<number>(
    "xenroutine:overview:horizon",
    DEFAULT_HORIZON_DAYS,
    (v): v is number => HORIZON_OPTIONS.some((h) => h.days === v),
  );
  // Simplified shows one card per routine (its current due date); detailed shows every
  // occurrence in the window.
  const [simplified, setSimplified] = useLocalStorageState<boolean>(
    "xenroutine:overview:simplified",
    false,
    (v): v is boolean => typeof v === "boolean",
  );
  const queuedDone = useQueuedDoneKeys(user?.id);
  const pending = useMemo(
    () =>
      pendingOccurrences(routines, new Date(), horizonDays, simplified).filter(
        (o) => !queuedDone.has(`${o.routine._id}:${o.routine.due_at}:${o.index}`),
      ),
    [routines, horizonDays, simplified, queuedDone],
  );
  const completions = useMemo(() => recentCompletions(routines), [routines]);

  if (isLoading) return <ListSkeleton rows={4} height={140} />;
  if (isError) return <ErrorDisplay error={error as Error} onRetry={() => refetch()} />;
  if (routines.length === 0) {
    return (
      <EmptyState
        icon={<EventRepeatIcon />}
        title="No routines yet"
        description="Add things you do on a schedule — filters, oil changes, smoke alarm batteries — and get reminded when they're due."
        action={
          <Button variant="contained" onClick={openCreate}>
            Add your first routine
          </Button>
        }
      />
    );
  }

  const showPending = filter !== "completed";
  const showCompleted = filter !== "pending";
  const horizonLabel = HORIZON_OPTIONS.find((h) => h.days === horizonDays)?.label ?? `${horizonDays} days`;

  const renderCards = (items: Occurrence[]) =>
    items.map((o) => (
      // Keyed by due date and index: after a completion a routine comes back with a new
      // due_at and must mount as fresh, unlocked cards.
      <PendingCard key={`${o.routine._id}:${o.routine.due_at}:${o.index}`} occ={o} userId={user?.id} />
    ));

  // Beyond the first 30 days, group by calendar month rather than one long list.
  const later = pending.filter((o) => bucketForDate(o.date) === "later");
  const laterByMonth = later.reduce<Map<string, Occurrence[]>>((acc, o) => {
    const key = format(o.date, "MMMM yyyy");
    acc.set(key, [...(acc.get(key) ?? []), o]);
    return acc;
  }, new Map());

  return (
    <Stack spacing={2}>
      {/* Simplified and Look ahead only affect the pending list, so they stay put but
                disable under the Complete filter - the toolbar doesn't jump around. */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
        <ToggleButtonGroup
          exclusive
          size="small"
          disabled={!showPending}
          value={simplified ? "simple" : "detailed"}
          onChange={(_, v) => {
            if (v) setSimplified(v === "simple");
          }}
        >
          <ToggleButton value="simple">Simplified</ToggleButton>
          <ToggleButton value="detailed">
            Every
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, whiteSpace: "pre" }}>
              {" "}
              occurrence
            </Box>
          </ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={filter}
          onChange={(_, v) => {
            if (v) setFilter(v);
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="pending">Pending</ToggleButton>
          <ToggleButton value="completed">Complete</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Stack direction="row" justifyContent="flex-end">
        <TextField
          select
          size="small"
          label="Look ahead"
          value={horizonDays}
          disabled={!showPending}
          onChange={(e) => setHorizonDays(Number(e.target.value))}
          sx={{ minWidth: 140 }}
        >
          {HORIZON_OPTIONS.map((h) => (
            <MenuItem key={h.days} value={h.days}>
              {h.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {showPending &&
        (pending.length === 0 ? (
          <EmptyState
            icon={<CheckCircleOutlineIcon />}
            title="All caught up"
            description={`Nothing is overdue or due in the next ${horizonLabel}.`}
          />
        ) : (
          <>
            {BUCKETS.map(({ bucket, title }) => {
              const items = pending.filter((o) => bucketForDate(o.date) === bucket);
              if (items.length === 0) return null;
              return (
                <Box key={bucket}>
                  <Typography variant="overline" color={bucket === "overdue" ? "error" : "text.secondary"}>
                    {title} ({items.length})
                  </Typography>
                  {renderCards(items)}
                </Box>
              );
            })}
            {[...laterByMonth.entries()].map(([month, items]) => (
              <Box key={month}>
                <Typography variant="overline" color="text.secondary">
                  {month} ({items.length})
                </Typography>
                {renderCards(items)}
              </Box>
            ))}
          </>
        ))}

      {showCompleted && (
        <Box>
          <Typography variant="overline" color="text.secondary">
            Completed, last 30 days ({completions.length})
          </Typography>
          {completions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing completed yet.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {completions.map((c, i) => (
                <Card
                  key={`${c.routineId}:${c.at}:${i}`}
                  variant="outlined"
                  sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}
                >
                  <CheckCircleOutlineIcon color="success" fontSize="small" />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {c.routineName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(c.at), "PP")}
                      {c.occurrenceAt ? ` (for ${format(new Date(c.occurrenceAt), "PP")})` : ""}
                      {c.by_username ? ` · ${c.by_username}` : ""}
                      {c.photos > 0 ? ` · ${c.photos} ${c.photos === 1 ? "photo" : "photos"}` : ""}
                      {c.note ? ` · ${c.note}` : ""}
                    </Typography>
                  </Box>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Stack>
  );
}
