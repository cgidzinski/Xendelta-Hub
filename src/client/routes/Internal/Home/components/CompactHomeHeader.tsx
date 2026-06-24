import { Box, Avatar, Typography, Skeleton } from "@mui/material";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { useInbox } from "../../../../hooks/user/useInbox";

function StatItem({
    icon,
    value,
    active,
}: {
    icon: React.ReactNode;
    value: number;
    active?: boolean;
}) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", color: active ? "primary.main" : "text.secondary" }}>
                {icon}
            </Box>
            <Typography variant="body2" fontWeight={active ? 600 : 400} color={active ? "primary.main" : "text.secondary"}>
                {value}
            </Typography>
        </Box>
    );
}

export default function CompactHomeHeader() {
    const { profile, isLoading: profileLoading } = useUserProfile();
    const { totalUnread, conversationsUnread, notificationsUnread, isLoading: inboxLoading } = useInbox();
    const isLoading = profileLoading || inboxLoading;

    if (isLoading) {
        return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
                <Skeleton variant="circular" width={36} height={36} />
                <Skeleton width={160} height={24} />
                <Box sx={{ ml: "auto", display: "flex", gap: 2 }}>
                    <Skeleton width={48} height={20} />
                    <Skeleton width={32} height={20} />
                    <Skeleton width={32} height={20} />
                </Box>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { xs: "flex-start", sm: "center" },
                gap: { xs: 1, sm: 0 },
                mb: 3,
            }}
        >
            {/* Identity */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
                <Avatar
                    src={profile?.avatar}
                    alt={profile?.username}
                    sx={{ width: 36, height: 36, flexShrink: 0 }}
                />
                <Typography
                    variant="h6"
                    noWrap
                    sx={{ minWidth: 0, fontWeight: 600 }}
                >
                    Welcome back, {profile?.username}!
                </Typography>
            </Box>

            {/* Stats */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, pl: { xs: "52px", sm: 2 } }}>
                <StatItem
                    icon={<EmojiEventsOutlinedIcon sx={{ fontSize: 16, color: "warning.main" }} />}
                    value={profile?.points ?? 0}
                    active={false}
                />
                <StatItem
                    icon={<MailOutlineIcon sx={{ fontSize: 16 }} />}
                    value={conversationsUnread}
                    active={conversationsUnread > 0}
                />
                <StatItem
                    icon={<NotificationsNoneIcon sx={{ fontSize: 16 }} />}
                    value={notificationsUnread}
                    active={notificationsUnread > 0}
                />
            </Box>
        </Box>
    );
}
