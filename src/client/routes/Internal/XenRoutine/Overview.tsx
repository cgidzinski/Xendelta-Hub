import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Collapse,
  LinearProgress,
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
import { closeSnackbar, useSnackbar } from "notistack";
import { useOutletContext } from "react-router-dom";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import {
  intervalLabel,
  readingText,
  thresholdLabel,
  useCompleteRoutine,
  useUndoRoutineCompletion,
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
  isArmedThreshold,
  pendingOccurrences,
  recentCompletions,
  type Bucket,
  type Occurrence,
} from "../../../hooks/xenroutine/routineViews";
import { useLocalStorageState } from "../../../hooks/useLocalStorageState";
import CompleteDialog from "./components/CompleteDialog";
import ReadingDialog from "./components/ReadingDialog";
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

function PendingCard({ occ }: { occ: Occurrence }) {
  const { routine, index, date } = occ;
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const complete = useCompleteRoutine();
  const undoCompletion = useUndoRoutineCompletion();
  const invalidate = useInvalidateRoutines();
  const [leaving, setLeaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const projected = index > 1;
  const threshold = routine.kind === "threshold" ? routine.threshold : null;
  const armed = isArmedThreshold(routine);
  const [readingOpen, setReadingOpen] = useState(false);

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
    extra: {
      note?: string;
      images?: File[];
      reading?: number;
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    } = {},
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
      enqueueSnackbar(e?.response?.data?.message ?? e?.message ?? "Couldn't mark as done", { variant: "error" });
      if (e?.response?.status === 409) void invalidate();
      throw e;
    }
    // The card is about to leave, so the undo is a plain mutation that refetches the list itself when it settles.
    enqueueSnackbar(`“${routine.name}” marked as done`, {
      variant: "success",
      action: (key) => (
        <Button
          color="inherit"
          size="small"
          onClick={() => {
            closeSnackbar(key);
            undoCompletion.mutate(routine._id);
          }}
        >
          Undo
        </Button>
      ),
    });
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
            {threshold ? (
              <Typography variant="body2" color={armed ? "text.secondary" : "error.main"}>
                {armed
                  ? `${readingText(Math.max(0, threshold.target - threshold.current_value), threshold.unit)} to go (at ${readingText(threshold.target, threshold.unit)})`
                  : `Due at ${readingText(threshold.target, threshold.unit)} · now ${readingText(threshold.current_value, threshold.unit)}`}
              </Typography>
            ) : (
              <Typography variant="body2" color={bucketForDate(date) === "overdue" ? "error.main" : "text.secondary"}>
                {dueText(date)}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {threshold ? thresholdLabel(threshold) : intervalLabel(routine.interval)}
              {!projected &&
                ` · ${
                  routine.last_done_at
                    ? `last done ${formatDistanceToNowStrict(new Date(routine.last_done_at), { addSuffix: true })}`
                    : "never marked done"
                }`}
              {projected && " · upcoming"}
            </Typography>
          </Box>
          <RoutineMenu routine={routine} variant="overview" allowPostpone={!projected && !threshold} />
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
        {threshold && (
          <LinearProgress
            variant="determinate"
            color={armed ? "primary" : "error"}
            value={Math.min(
              100,
              Math.max(0, ((threshold.current_value - threshold.last_done_value) / threshold.every) * 100),
            )}
            sx={{ mt: 1.5, borderRadius: 1 }}
          />
        )}
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 0.5 }}>
          {threshold && (
            <Button size="small" onClick={() => setReadingOpen(true)} sx={{ textTransform: "none" }}>
              Log reading
            </Button>
          )}
          <Button
            size="small"
            startIcon={<AddAPhotoOutlinedIcon />}
            onClick={() => setNoteOpen(true)}
            sx={{ textTransform: "none" }}
          >
            Done with a note or photos
          </Button>
        </Box>
        {threshold && <ReadingDialog routine={routine} open={readingOpen} onClose={() => setReadingOpen(false)} />}
        <CompleteDialog
          open={noteOpen}
          routineName={routine.name}
          reading={threshold ? { unit: threshold.unit, initial: threshold.current_value } : undefined}
          onClose={() => setNoteOpen(false)}
          onSubmit={async ({ note, files, onUploadProgress, reading }) => {
            await handleComplete({ note: note || undefined, images: files, onUploadProgress, reading });
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
  const allPending = useMemo(
    () => pendingOccurrences(routines, new Date(), horizonDays, simplified),
    [routines, horizonDays, simplified],
  );
  // Reading-based routines that haven't reached their target are always shown, in their own section.
  const tracking = allPending.filter((o) => isArmedThreshold(o.routine));
  const pending = allPending.filter((o) => !isArmedThreshold(o.routine));
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
      <PendingCard key={`${o.routine._id}:${o.routine.due_at}:${o.index}`} occ={o} />
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
        (pending.length === 0 && tracking.length === 0 ? (
          <EmptyState
            icon={<CheckCircleOutlineIcon />}
            title="All caught up"
            description={`Nothing is overdue or due in the next ${horizonLabel}.`}
          />
        ) : (
          <>
            {tracking.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Tracking by reading ({tracking.length})
                </Typography>
                {renderCards(tracking)}
              </Box>
            )}
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
