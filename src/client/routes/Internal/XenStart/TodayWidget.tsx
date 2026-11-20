import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, startOfDay } from "date-fns";
import { useSnackbar } from "notistack";
import { Link } from "react-router-dom";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import type { ApiError } from "../../../config/api";
import { feedKeys } from "../../../hooks/feed/keys";
import { checklistProgress, dueText, routinesDueToday } from "../../../hooks/xenroutine/routineViews";
import { useRoutineSocket } from "../../../hooks/xenroutine/useRoutineSocket";
import {
  useCompleteRoutine,
  useInvalidateRoutines,
  useRoutines,
  useUndoRoutineCompletion,
  type Routine,
} from "../../../hooks/xenroutine/useRoutines";

const PREVIEW_COUNT = 5;
const ROUTINE_PATH = "/internal/xenroutine/overview";

export default function TodayWidget() {
  useRoutineSocket();
  const { routines, isLoading, isError, refetch } = useRoutines();
  const { mutateAsync: complete } = useCompleteRoutine();
  const { mutate: undo } = useUndoRoutineCompletion();
  const refreshRoutines = useInvalidateRoutines();
  const client = useQueryClient();
  const confirm = useConfirm();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let timer: number;
    const refreshDay = () => {
      window.clearTimeout(timer);
      const time = new Date();
      setNow(time);
      timer = window.setTimeout(refreshDay, startOfDay(addDays(time, 1)).getTime() - time.getTime());
    };
    refreshDay();
    document.addEventListener("visibilitychange", refreshDay);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshDay);
    };
  }, []);

  const due = routinesDueToday(routines, now);
  const shown = expanded ? due : due.slice(0, PREVIEW_COUNT);
  const refreshAttention = () => client.invalidateQueries({ queryKey: feedKeys.attention() });

  const markDone = async (routine: Routine) => {
    setActiveId(routine._id);
    try {
      const { done, total } = checklistProgress(routine.checklist);
      const remaining = total - done;
      const confirmed = await confirm({
        title: "Mark as done",
        message: remaining
          ? `“${routine.name}” has ${remaining} unticked ${remaining === 1 ? "step" : "steps"}. Mark it as done anyway?`
          : `Mark “${routine.name}” as done?`,
        confirmLabel: "Mark as done",
        destructive: false,
      });
      if (!confirmed) return;
      await complete({ id: routine._id, expected_due_at: routine.due_at });
      await Promise.all([refreshRoutines(), refreshAttention()]);
      enqueueSnackbar(`“${routine.name}” marked as done`, {
        variant: "success",
        action: (key) => (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              closeSnackbar(key);
              undo(routine._id, { onSuccess: () => void refreshAttention() });
            }}
          >
            Undo
          </Button>
        ),
      });
    } catch (error) {
      if ((error as ApiError)?.status === 409) void refreshRoutines();
      enqueueSnackbar(error instanceof Error ? error.message : "Couldn't mark the routine as done.", {
        variant: "error",
      });
    } finally {
      setActiveId(null);
    }
  };

  return (
    <Card component="section" aria-label="Today" variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
        <Typography component="h2" variant="subtitle1">
          Today
        </Typography>
        <Button size="small" component={Link} to={ROUTINE_PATH}>
          Open XenRoutine
        </Button>
      </Stack>
      {isLoading ? (
        <ListSkeleton rows={2} height={48} gap={0.5} />
      ) : isError ? (
        <Alert severity="error" action={<Button onClick={() => void refetch()}>Retry</Button>}>
          Couldn’t load routines.
        </Alert>
      ) : due.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 1 }}>
          No routines due today or overdue.
        </Typography>
      ) : (
        <Stack component="ul" spacing={0} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {shown.map((routine) => (
            <Stack
              key={routine._id}
              component="li"
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              gap={1}
              sx={{ borderTop: "1px solid", borderColor: "divider", py: 0.75 }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={500} variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {routine.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {dueText(routine, now)}
                </Typography>
              </Box>
              <Button
                size="small"
                startIcon={<CheckIcon />}
                aria-label={`Mark ${routine.name} as done`}
                disabled={activeId !== null}
                onClick={() => void markDone(routine)}
                sx={{ flexShrink: 0 }}
              >
                {activeId === routine._id ? "Working…" : "Done"}
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
      {due.length > PREVIEW_COUNT && !isError && (
        <Button size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show ${due.length - PREVIEW_COUNT} more`}
        </Button>
      )}
    </Card>
  );
}
