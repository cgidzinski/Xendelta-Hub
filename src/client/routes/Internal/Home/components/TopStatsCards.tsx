import { Box, Card, CardContent, Typography, Avatar, Chip, LinearProgress, Divider, Skeleton } from "@mui/material";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { useInbox } from "../../../../hooks/user/useInbox";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const cardSx = {
    variant: "outlined" as const,
    borderRadius: 2,
    flex: 1,
    minWidth: 0,
    width: { xs: "100%", sm: "auto" },
    border: "1px solid",
    borderColor: "divider",
};

export default function TopStatsCards() {
    const { profile, isLoading: profileLoading } = useUserProfile();
    const { inboxItems: _inboxItems, totalUnread, conversationsUnread, notificationsUnread, isLoading: inboxLoading } = useInbox();
    const spaceAllowed = profile?.xenbox.spaceAllowed ?? 0;
    const spaceUsed = profile?.xenbox.spaceUsed ?? 0;
    const fileCount = profile?.xenbox.fileCount ?? 0;

    return (
        <Box
            sx={{
                width: "100%",
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: { xs: 2, sm: 3 },
                mb: 4,
            }}
        >
            {/* Card 1 — Profile */}
            <Card elevation={0} sx={cardSx}>
                <CardContent sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                    {profileLoading ? (
                        <>
                            <Skeleton variant="circular" width={52} height={52} />
                            <Box sx={{ flex: 1 }}>
                                <Skeleton width="60%" height={28} />
                                <Skeleton width="40%" height={20} sx={{ mt: 0.5 }} />
                                <Skeleton width="80%" height={24} sx={{ mt: 1 }} />
                            </Box>
                        </>
                    ) : (
                        <>
                            <Avatar
                                src={profile?.avatar}
                                alt={profile?.username}
                                sx={{ width: 52, height: 52, mt: 0.25 }}
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="h6" noWrap>{profile?.username}</Typography>
                                <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 1 }}>
                                    {profile?.email}
                                </Typography>
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                    {(profile?.roles ?? []).map((role) => (
                                        <Chip key={role} label={role} size="small" variant="outlined" />
                                    ))}
                                </Box>
                            </Box>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Card 2 — Inbox */}
            <Card
                elevation={0}
                sx={cardSx}
            >
                <CardContent>
                    {inboxLoading ? (
                        <>
                            <Skeleton width="40%" height={36} />
                            <Skeleton width="60%" height={20} sx={{ mt: 0.5 }} />
                            <Skeleton width="80%" height={20} sx={{ mt: 1.5 }} />
                        </>
                    ) : (
                        <>
                            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1 }}>
                                <Typography variant="h4" fontWeight={700} color={totalUnread > 0 ? "primary.main" : "text.primary"}>
                                    {totalUnread}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">unread</Typography>
                            </Box>
                            <Box sx={{ display: "flex", gap: 2 }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <MailOutlineIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                    <Typography variant="caption" color="text.secondary">{conversationsUnread} messages</Typography>
                                </Box>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <NotificationsNoneIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                    <Typography variant="caption" color="text.secondary">{notificationsUnread} notifications</Typography>
                                </Box>
                            </Box>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Card 3 — Points + Storage */}
            <Card elevation={0} sx={cardSx}>
                <CardContent>
                    {profileLoading ? (
                        <>
                            <Skeleton width="50%" height={36} />
                            <Skeleton width="35%" height={20} sx={{ mt: 0.5 }} />
                            <Skeleton width="100%" height={8} sx={{ mt: 2, borderRadius: 1 }} />
                        </>
                    ) : (
                        <>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
                                <EmojiEventsOutlinedIcon sx={{ color: "warning.main" }} />
                                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                                    <Typography variant="h4" fontWeight={700}>{profile?.points ?? 0}</Typography>
                                    <Typography variant="body2" color="text.secondary">pts</Typography>
                                </Box>
                            </Box>
                            <Divider sx={{ my: 1.5 }} />
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                                <FolderOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                                <Typography variant="body2" color="text.secondary">{fileCount} files</Typography>
                                {spaceAllowed > 0 && (
                                    <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                                        {formatBytes(spaceUsed)} / {formatBytes(spaceAllowed)}
                                    </Typography>
                                )}
                            </Box>
                            {spaceAllowed > 0 && (
                                <LinearProgress
                                    variant="determinate"
                                    value={Math.min((spaceUsed / spaceAllowed) * 100, 100)}
                                    sx={{ borderRadius: 1, height: 6 }}
                                />
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}
