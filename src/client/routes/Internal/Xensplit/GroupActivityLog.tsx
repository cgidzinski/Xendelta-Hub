import { useMemo } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { Box, Typography, Avatar, Button, CircularProgress } from "@mui/material";
import RepeatIcon from "@mui/icons-material/Repeat";
import { formatDistance } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import { useXenSplitGroupLog } from "../../../hooks/xensplit/useGroupLog";
import { groupByDay } from "../../../utils/dateGrouping";
import { describeLogEntry } from "../../../utils/xensplitLog";
import { xsCardSx } from "./components/rowStyles";
import ErrorDisplay from "../../../components/ErrorDisplay";

export default function GroupActivityLog() {
    const { group, isCreator } = useOutletContext<GroupDetailContext>();
    const { entries, users, isLoading, isError, error, hasMore, loadMore, isLoadingMore } = useXenSplitGroupLog(group._id, isCreator);

    const nameOf = useMemo(() => {
        const members = new Map(group.members.map((m) => [m.user_id, m.username]));
        return (id: string) => users[id]?.username ?? members.get(id) ?? "Former member";
    }, [group.members, users]);
    const avatarOf = (id: string) => users[id]?.avatar ?? group.members.find((m) => m.user_id === id)?.avatar ?? undefined;

    const days = useMemo(() => groupByDay(entries, (e) => e.created_at), [entries]);

    // The server refuses anyone but the owner; don't leave a stray URL showing an error
    if (!isCreator) return <Navigate to={`/internal/xensplit/groups/${group._id}/overview`} replace />;

    return (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, minHeight: 48 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Activity Log
                </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                Everything that has changed in this group. Only you, as the owner, can see this.
            </Typography>

            {isLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                    <CircularProgress size={28} />
                </Box>
            ) : isError ? (
                <ErrorDisplay error={error as Error} />
            ) : entries.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                    No activity recorded yet.
                </Typography>
            ) : (
                <>
                    {days.map((day) => (
                        <Box key={day.key} sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                                {day.label}
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                {day.items.map((entry) => {
                                    const { actor, text, details } = describeLogEntry(entry, nameOf);
                                    return (
                                        <Box
                                            key={entry._id}
                                            sx={{ ...xsCardSx, display: "grid", gridTemplateColumns: "32px 1fr", columnGap: 1.5, alignItems: "start" }}
                                        >
                                            {entry.actor_id ? (
                                                <Avatar src={avatarOf(entry.actor_id)} sx={{ width: 32, height: 32, fontSize: 14 }}>
                                                    {actor[0]?.toUpperCase()}
                                                </Avatar>
                                            ) : (
                                                <Avatar sx={{ width: 32, height: 32, bgcolor: "action.selected", color: "text.secondary" }}>
                                                    <RepeatIcon sx={{ fontSize: 18 }} />
                                                </Avatar>
                                            )}
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                                                    <Box component="span" sx={{ fontWeight: 600 }}>{actor}</Box> {text}
                                                </Typography>
                                                {details.map((line, i) => (
                                                    <Typography key={i} variant="caption" color="text.secondary" sx={{ display: "block", wordBreak: "break-word" }}>
                                                        {line}
                                                    </Typography>
                                                ))}
                                                <Typography
                                                    variant="caption"
                                                    color="text.disabled"
                                                    title={new Date(entry.created_at).toLocaleString()}
                                                    sx={{ display: "block", mt: 0.25 }}
                                                >
                                                    {formatDistance(new Date(entry.created_at), new Date(), { addSuffix: true })}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Box>
                    ))}
                    {hasMore && (
                        <Box sx={{ display: "flex", justifyContent: "center", pb: 2 }}>
                            <Button variant="outlined" size="small" onClick={() => loadMore()} disabled={isLoadingMore}>
                                {isLoadingMore ? "Loading…" : "Load more"}
                            </Button>
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
}
