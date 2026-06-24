import { Box, Typography, Skeleton } from "@mui/material";
import { useXenSplits } from "../../../../hooks/xensplit/useGroups";
import { useAuth } from "../../../../contexts/AuthContext";
import GroupCard from "../../Xensplit/components/GroupCard";

export default function XenSplitCardBody() {
    const { groups, isLoading } = useXenSplits();
    const { user } = useAuth();

    if (isLoading) return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 2 }} />)}
        </Box>
    );

    const recent = groups.slice(0, 3);

    return (
        <Box>
            {recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No groups yet.</Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {recent.map((group) => (
                        <GroupCard key={group._id} group={group} userId={user?.id || ""} />
                    ))}
                </Box>
            )}
        </Box>
    );
}
