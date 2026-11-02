import { Box, Button, Card, Chip, Stack, Tooltip, Typography } from "@mui/material";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import GroupIcon from "@mui/icons-material/Group";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useOutletContext } from "react-router-dom";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { intervalLabel, useRoutines } from "../../../hooks/xenroutine/useRoutines";
import RoutineMenu from "./components/RoutineMenu";
import type { XenRoutineOutletContext } from "./outletContext";

/** The base routine definitions: every routine, whatever its due date, paused ones included. */
export default function Routines() {
    const { openCreate, openEdit } = useOutletContext<XenRoutineOutletContext>();
    const { routines, isLoading, isError, error, refetch } = useRoutines();

    if (isLoading) return <ListSkeleton rows={4} height={96} />;
    if (isError) return <ErrorDisplay error={error as Error} onRetry={() => refetch()} />;
    if (routines.length === 0) {
        return (
            <EmptyState
                icon={<EventRepeatIcon />}
                title="No routines yet"
                description="Add things you do on a schedule — filters, oil changes, smoke alarm batteries."
                action={<Button variant="contained" onClick={openCreate}>Add your first routine</Button>}
            />
        );
    }

    return (
        <Stack spacing={1.5}>
            {routines.map((r) => (
                <Card key={r._id} variant="outlined" sx={{ p: 2, opacity: r.enabled ? 1 : 0.6 }}>
                    <Stack direction="row" alignItems="flex-start" spacing={1}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>{r.name}</Typography>
                                {!r.enabled && <Chip size="small" label="Paused" />}
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
                            <Typography variant="body2" color="text.secondary">
                                {intervalLabel(r.interval)}{r.enabled ? ` · next due ${format(new Date(r.due_at), "PP")}` : ""}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {r.last_done_at
                                    ? `Last done ${formatDistanceToNowStrict(new Date(r.last_done_at), { addSuffix: true })}`
                                    : "Never marked done"}
                            </Typography>
                        </Box>
                        <RoutineMenu routine={r} variant="routines" onEdit={openEdit} />
                    </Stack>
                </Card>
            ))}
        </Stack>
    );
}
