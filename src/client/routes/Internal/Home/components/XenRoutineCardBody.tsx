import EmptyState from "../../../../components/ui/EmptyState";
import { Box, Skeleton, Typography } from "@mui/material";
import { useRoutines } from "../../../../hooks/xenroutine/useRoutines";

export default function XenRoutineCardBody() {
    const { routines, isLoading } = useRoutines();

    if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />;

    const active = routines.filter((r) => r.enabled);
    const overdue = active.filter((r) => r.status === "overdue");
    const soon = active.filter((r) => r.status === "due_soon");
    // Server returns soonest-due first, so the head of this list is what needs doing next.
    const next = [...overdue, ...soon].slice(0, 3);

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                <Box component="span" sx={{ fontWeight: 700, color: overdue.length ? "error.main" : "text.primary" }}>{overdue.length}</Box> overdue
                {" · "}
                <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{soon.length}</Box> due soon
            </Typography>
            {active.length === 0 ? (
                <EmptyState description="No routines yet." sx={{ py: 1 }} />
            ) : next.length === 0 ? (
                <Typography variant="body2" color="text.secondary">All caught up.</Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    {next.map((r) => (
                        <Typography key={r._id} variant="body2" noWrap color={r.status === "overdue" ? "error.main" : "text.primary"}>
                            {r.name}
                        </Typography>
                    ))}
                </Box>
            )}
        </Box>
    );
}
