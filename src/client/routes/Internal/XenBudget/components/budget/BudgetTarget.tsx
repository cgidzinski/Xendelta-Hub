import { Avatar, Box, Stack, Typography, alpha } from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";
import type { XenBudgetMember } from "../../../../../hooks/xenbudget/types";

interface BudgetTargetProps {
    /** Omit for the shared limit; pass a member id for a per-person one. */
    personId?: string;
    personName?: string;
    members: XenBudgetMember[];
    size?: number;
}

/**
 * Who a limit applies to.
 *
 * Everyone gets a labelled pill rather than blank space: "no avatar" and "the shared
 * limit" look identical otherwise, which is exactly the distinction a budget carrying
 * both needs to make.
 */
export default function BudgetTarget({ personId, personName, members, size = 20 }: BudgetTargetProps) {
    if (!personId) {
        return (
            <Stack
                direction="row" alignItems="center" spacing={0.5}
                sx={{
                    px: 0.75, py: 0.125, borderRadius: 999, flexShrink: 0,
                    bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
                }}
            >
                <GroupsIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                <Typography variant="caption" color="text.secondary">Everyone</Typography>
            </Stack>
        );
    }

    const member = members.find((m) => m.user_id === personId);
    const name = member?.username || personName || "Unknown";
    return (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
            <Avatar
                src={member?.avatar || undefined}
                sx={{ width: size, height: size, fontSize: size * 0.5, flexShrink: 0 }}
            >
                {name[0]?.toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>{name}</Typography>
            </Box>
        </Stack>
    );
}
