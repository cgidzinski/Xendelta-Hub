import { useMemo, useState } from "react";
import {
    Box, Button, Card, Chip, Container, Fab, IconButton, Menu, MenuItem, Stack, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import GroupIcon from "@mui/icons-material/Group";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import {
    intervalLabel, useCompleteRoutine, useCreateRoutine, useDeleteRoutine, usePostponeRoutine, useRoutines,
    useSetRoutineNotifications, useShareRoutine, useUnshareRoutine, useUpdateRoutine,
    type DueStatus, type Routine,
} from "../../../hooks/xenroutine/useRoutines";
import { useAuth } from "../../../contexts/AuthContext";
import RoutineDialog from "./components/RoutineDialog";
import NotificationOptions from "./components/NotificationOptions";
import ShareDialog from "./components/ShareDialog";
import HistoryDialog from "./components/HistoryDialog";
import SlideToComplete from "./components/SlideToComplete";

const POSTPONE_PRESETS = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
];

const GROUPS: { status: DueStatus; title: string }[] = [
    { status: "overdue", title: "Overdue" },
    { status: "due_soon", title: "Due soon" },
    { status: "ok", title: "Upcoming" },
];

function dueText(r: Routine): string {
    const days = differenceInCalendarDays(new Date(r.due_at), new Date());
    if (days === 0) return "Due today";
    if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
    return `Due in ${days} day${days === 1 ? "" : "s"} (${format(new Date(r.due_at), "PP")})`;
}

export default function XenRoutine() {
    useTitle("XenRoutine");
    const { enqueueSnackbar } = useSnackbar();
    const confirm = useConfirm();
    const { user } = useAuth();
    const { routines, isLoading, isError, error, refetch } = useRoutines();

    const createRoutine = useCreateRoutine();
    const updateRoutine = useUpdateRoutine();
    const deleteRoutine = useDeleteRoutine();
    const completeRoutine = useCompleteRoutine();
    const postponeRoutine = usePostponeRoutine();
    const setNotifications = useSetRoutineNotifications();
    const shareRoutine = useShareRoutine();
    const unshareRoutine = useUnshareRoutine();

    const [editing, setEditing] = useState<Routine | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [notifFor, setNotifFor] = useState<string | null>(null);
    const [shareFor, setShareFor] = useState<string | null>(null);
    const [historyFor, setHistoryFor] = useState<string | null>(null);
    const [postponeAnchor, setPostponeAnchor] = useState<{ el: HTMLElement; id: string } | null>(null);
    const [moreAnchor, setMoreAnchor] = useState<{ el: HTMLElement; id: string } | null>(null);

    // Look dialogs' routine up from live data so they reflect refetches (e.g. a new sharer).
    const byId = (id: string | null) => routines.find((r) => r._id === id) ?? null;

    const grouped = useMemo(() => GROUPS.map((g) => ({
        ...g,
        items: routines.filter((r) => r.enabled && r.status === g.status),
    })), [routines]);
    const paused = routines.filter((r) => !r.enabled);

    const run = async (p: Promise<unknown>, ok: string) => {
        try {
            await p;
            enqueueSnackbar(ok, { variant: "success" });
        } catch (e: any) {
            enqueueSnackbar(e?.response?.data?.message ?? "Something went wrong", { variant: "error" });
            throw e;
        }
    };

    const moreRoutine = byId(moreAnchor?.id ?? null);

    const renderCard = (r: Routine) => (
        <Card key={r._id} variant="outlined" sx={{ p: 2, opacity: r.enabled ? 1 : 0.6 }}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>{r.name}</Typography>
                        {r.category && <Chip size="small" label={r.category} />}
                        {r.members.length > 1 && (
                            <Tooltip title={`Shared with ${r.members.map((m) => m.username).join(", ")}`}>
                                <GroupIcon fontSize="small" color="action" />
                            </Tooltip>
                        )}
                        {r.my_notifications?.muted && (
                            <Tooltip title="Muted"><NotificationsOffIcon fontSize="small" color="action" /></Tooltip>
                        )}
                    </Stack>
                    <Typography variant="body2" color={r.status === "overdue" ? "error.main" : "text.secondary"}>
                        {r.enabled ? dueText(r) : "Paused"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {intervalLabel(r.interval)} · {r.last_done_at
                            ? `last done ${formatDistanceToNowStrict(new Date(r.last_done_at), { addSuffix: true })}`
                            : "never marked done"}
                    </Typography>
                </Box>
                <IconButton aria-label="More actions" size="small" onClick={(e) => setMoreAnchor({ el: e.currentTarget, id: r._id })}>
                    <MoreVertIcon />
                </IconButton>
            </Stack>
            {r.enabled && (
                <Box sx={{ mt: 1.5 }}>
                    <SlideToComplete
                        onComplete={() => run(completeRoutine.mutateAsync({ id: r._id }), "Marked as done").catch(() => {})}
                        onKeyboardActivate={async () => {
                            if (await confirm({ title: "Mark as done", message: `Mark “${r.name}” as done?`, confirmLabel: "Done", destructive: false })) {
                                run(completeRoutine.mutateAsync({ id: r._id }), "Marked as done").catch(() => {});
                            }
                        }}
                    />
                </Box>
            )}
        </Card>
    );

    return (
        <Container maxWidth="md" sx={{ mt: 3, mb: 10 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>XenRoutine</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setDialogOpen(true); }}
                    sx={{ display: { xs: "none", sm: "inline-flex" } }}>
                    New routine
                </Button>
            </Stack>

            {isLoading ? <ListSkeleton rows={4} height={112} /> : isError ? (
                <ErrorDisplay error={error as Error} onRetry={() => refetch()} />
            ) : routines.length === 0 ? (
                <EmptyState
                    icon={<EventRepeatIcon />}
                    title="No routines yet"
                    description="Add things you do on a schedule — filters, oil changes, smoke alarm batteries — and get reminded when they're due."
                    action={<Button variant="contained" onClick={() => { setEditing(null); setDialogOpen(true); }}>Add your first routine</Button>}
                />
            ) : (
                <Stack spacing={3}>
                    {grouped.filter((g) => g.items.length > 0).map((g) => (
                        <Box key={g.status}>
                            <Typography variant="overline" color={g.status === "overdue" ? "error" : "text.secondary"}>
                                {g.title} ({g.items.length})
                            </Typography>
                            <Stack spacing={1.5}>{g.items.map(renderCard)}</Stack>
                        </Box>
                    ))}
                    {paused.length > 0 && (
                        <Box>
                            <Typography variant="overline" color="text.secondary">Paused ({paused.length})</Typography>
                            <Stack spacing={1.5}>{paused.map(renderCard)}</Stack>
                        </Box>
                    )}
                </Stack>
            )}

            <Fab color="primary" aria-label="New routine" onClick={() => { setEditing(null); setDialogOpen(true); }}
                sx={{ position: "fixed", right: 16, bottom: 16, display: { xs: "flex", sm: "none" } }}>
                <AddIcon />
            </Fab>

            <Menu open={!!postponeAnchor} anchorEl={postponeAnchor?.el} onClose={() => setPostponeAnchor(null)}>
                {POSTPONE_PRESETS.map((p) => (
                    <MenuItem key={p.days} onClick={() => {
                        const id = postponeAnchor!.id;
                        setPostponeAnchor(null);
                        run(postponeRoutine.mutateAsync({ id, days: p.days }), `Postponed ${p.label}`).catch(() => {});
                    }}>{p.label}</MenuItem>
                ))}
            </Menu>

            <Menu open={!!moreAnchor} anchorEl={moreAnchor?.el} onClose={() => setMoreAnchor(null)}>
                {moreRoutine?.enabled && (
                    <MenuItem onClick={() => { setPostponeAnchor({ el: moreAnchor!.el, id: moreAnchor!.id }); setMoreAnchor(null); }}>Postpone…</MenuItem>
                )}
                <MenuItem onClick={() => { setHistoryFor(moreAnchor!.id); setMoreAnchor(null); }}>History &amp; notes</MenuItem>
                <MenuItem onClick={() => { setNotifFor(moreAnchor!.id); setMoreAnchor(null); }}>Notification options</MenuItem>
                {moreRoutine?.is_owner && <MenuItem onClick={() => { setShareFor(moreAnchor!.id); setMoreAnchor(null); }}>Share</MenuItem>}
                {moreRoutine?.is_owner && <MenuItem onClick={() => { setEditing(moreRoutine); setDialogOpen(true); setMoreAnchor(null); }}>Edit</MenuItem>}
                {moreRoutine?.is_owner && (
                    <MenuItem onClick={() => {
                        const r = moreRoutine; setMoreAnchor(null);
                        run(updateRoutine.mutateAsync({ id: r._id, patch: { enabled: !r.enabled } }), r.enabled ? "Paused" : "Resumed").catch(() => {});
                    }}>{moreRoutine.enabled ? "Pause" : "Resume"}</MenuItem>
                )}
                {moreRoutine && !moreRoutine.is_owner && (
                    <MenuItem onClick={async () => {
                        const r = moreRoutine; setMoreAnchor(null);
                        if (await confirm({ title: "Leave routine", message: `Stop seeing “${r.name}”?`, confirmLabel: "Leave" })) {
                            run(unshareRoutine.mutateAsync({ id: r._id, userId: user!.id }), "Left routine").catch(() => {});
                        }
                    }}>Leave</MenuItem>
                )}
                {moreRoutine?.is_owner && (
                    <MenuItem sx={{ color: "error.main" }} onClick={async () => {
                        const r = moreRoutine; setMoreAnchor(null);
                        if (await confirm({ title: "Delete routine", message: `Delete “${r.name}” and its history?` })) {
                            run(deleteRoutine.mutateAsync(r._id), "Routine deleted").catch(() => {});
                        }
                    }}>Delete</MenuItem>
                )}
            </Menu>

            <RoutineDialog
                open={dialogOpen}
                routine={editing}
                onClose={() => setDialogOpen(false)}
                onSubmit={(input) => editing
                    ? run(updateRoutine.mutateAsync({ id: editing._id, patch: input }), "Routine saved")
                    : run(createRoutine.mutateAsync(input), "Routine created")}
            />
            <NotificationOptions
                open={!!notifFor}
                routine={byId(notifFor)}
                onClose={() => setNotifFor(null)}
                onSave={(v) => run(setNotifications.mutateAsync({ id: notifFor!, ...v }), "Notification options saved")}
            />
            <ShareDialog
                open={!!shareFor}
                routine={byId(shareFor)}
                onClose={() => setShareFor(null)}
                onAdd={(userIds) => run(shareRoutine.mutateAsync({ id: shareFor!, userIds }), "Shared")}
                onRemove={(userId) => run(unshareRoutine.mutateAsync({ id: shareFor!, userId }), "Removed")}
            />
            <HistoryDialog open={!!historyFor} routine={byId(historyFor)} onClose={() => setHistoryFor(null)} />
        </Container>
    );
}
