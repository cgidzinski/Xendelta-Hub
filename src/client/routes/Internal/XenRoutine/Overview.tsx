import { useMemo, useState } from "react";
import { Box, Button, Card, Collapse, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useSnackbar } from "notistack";
import { useOutletContext } from "react-router-dom";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import {
    intervalLabel, useCompleteRoutine, useInvalidateRoutines, useRoutines, type Routine,
} from "../../../hooks/xenroutine/useRoutines";
import {
    dueText, pendingRoutines, recentCompletions, routineStatusBucket, type Bucket,
} from "../../../hooks/xenroutine/routineViews";
import SlideToComplete from "./components/SlideToComplete";
import RoutineMenu from "./components/RoutineMenu";
import type { XenRoutineOutletContext } from "./outletContext";

type Filter = "pending" | "completed" | "all";

const BUCKETS: { bucket: Bucket; title: string }[] = [
    { bucket: "overdue", title: "Overdue" },
    { bucket: "soon", title: "Due soon" },
    { bucket: "month", title: "Later this month" },
];

// How long the exit animation runs before the list is refetched; must cover Collapse's timeout.
const EXIT_MS = 350;

function PendingCard({ routine }: { routine: Routine }) {
    const { enqueueSnackbar } = useSnackbar();
    const confirm = useConfirm();
    const complete = useCompleteRoutine();
    const invalidate = useInvalidateRoutines();
    const [leaving, setLeaving] = useState(false);

    // Resolves once the server has recorded the completion. The card then collapses and only
    // afterwards is the list refetched, so the slid handle stays put until the card is gone.
    // Rejects on failure so the slider can spring back.
    const handleComplete = async () => {
        try {
            await complete.mutateAsync({ id: routine._id });
        } catch (e: any) {
            enqueueSnackbar(e?.response?.data?.message ?? "Couldn't mark as done", { variant: "error" });
            throw e;
        }
        enqueueSnackbar(`“${routine.name}” marked as done`, { variant: "success" });
        setLeaving(true);
        // A timer rather than onExited so the refetch still happens if the user navigates away.
        setTimeout(() => { void invalidate(); }, EXIT_MS);
    };

    return (
        <Collapse in={!leaving} timeout={EXIT_MS - 50} unmountOnExit>
            <Card variant="outlined" sx={{ p: 2, mb: 1.5 }}>
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>{routine.name}</Typography>
                        <Typography variant="body2" color={routineStatusBucket(routine) === "overdue" ? "error.main" : "text.secondary"}>
                            {dueText(routine)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {intervalLabel(routine.interval)} · {routine.last_done_at
                                ? `last done ${formatDistanceToNowStrict(new Date(routine.last_done_at), { addSuffix: true })}`
                                : "never marked done"}
                        </Typography>
                    </Box>
                    <RoutineMenu routine={routine} variant="overview" />
                </Stack>
                <Box sx={{ mt: 1.5 }}>
                    <SlideToComplete
                        onComplete={handleComplete}
                        onKeyboardActivate={async () => {
                            if (await confirm({ title: "Mark as done", message: `Mark “${routine.name}” as done?`, confirmLabel: "Done", destructive: false })) {
                                handleComplete().catch(() => {});
                            }
                        }}
                    />
                </Box>
            </Card>
        </Collapse>
    );
}

export default function Overview() {
    const { openCreate } = useOutletContext<XenRoutineOutletContext>();
    const { routines, isLoading, isError, error, refetch } = useRoutines();
    const [filter, setFilter] = useState<Filter>("pending");

    const pending = useMemo(() => pendingRoutines(routines), [routines]);
    const completions = useMemo(() => recentCompletions(routines), [routines]);

    if (isLoading) return <ListSkeleton rows={4} height={140} />;
    if (isError) return <ErrorDisplay error={error as Error} onRetry={() => refetch()} />;
    if (routines.length === 0) {
        return (
            <EmptyState
                icon={<EventRepeatIcon />}
                title="No routines yet"
                description="Add things you do on a schedule — filters, oil changes, smoke alarm batteries — and get reminded when they're due."
                action={<Button variant="contained" onClick={openCreate}>Add your first routine</Button>}
            />
        );
    }

    const showPending = filter !== "completed";
    const showCompleted = filter !== "pending";

    return (
        <Stack spacing={2}>
            <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v) => { if (v) setFilter(v); }}>
                <ToggleButton value="pending">Pending</ToggleButton>
                <ToggleButton value="completed">Completed</ToggleButton>
                <ToggleButton value="all">All</ToggleButton>
            </ToggleButtonGroup>

            {showPending && (
                pending.length === 0 ? (
                    <EmptyState
                        icon={<CheckCircleOutlineIcon />}
                        title="All caught up"
                        description="Nothing is overdue or due in the next 30 days."
                    />
                ) : (
                    BUCKETS.map(({ bucket, title }) => {
                        const items = pending.filter((r) => routineStatusBucket(r) === bucket);
                        if (items.length === 0) return null;
                        return (
                            <Box key={bucket}>
                                <Typography variant="overline" color={bucket === "overdue" ? "error" : "text.secondary"}>
                                    {title} ({items.length})
                                </Typography>
                                {/* Keyed by due date too: a short-interval routine comes back with a new
                                    due_at after completion and must mount as a fresh, unlocked card. */}
                                {items.map((r) => <PendingCard key={`${r._id}:${r.due_at}`} routine={r} />)}
                            </Box>
                        );
                    })
                )
            )}

            {showCompleted && (
                <Box>
                    <Typography variant="overline" color="text.secondary">Completed, last 30 days ({completions.length})</Typography>
                    {completions.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">Nothing completed yet.</Typography>
                    ) : (
                        <Stack spacing={1}>
                            {completions.map((c, i) => (
                                <Card key={`${c.routineId}:${c.at}:${i}`} variant="outlined" sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
                                    <CheckCircleOutlineIcon color="success" fontSize="small" />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{c.routineName}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {format(new Date(c.at), "PP")}{c.by_username ? ` · ${c.by_username}` : ""}{c.note ? ` · ${c.note}` : ""}
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
