import { Box, Grid, Typography } from "@mui/material";
import AppCard from "./AppCard";
import { APPS_REGISTRY } from "../../../../constants/apps";

interface PinnedAppsSectionProps {
    pinnedApps: string[];
    appDetails?: Record<string, React.ReactNode>;
}

export default function PinnedAppsSection({ pinnedApps, appDetails }: PinnedAppsSectionProps) {
    const pinned = APPS_REGISTRY.filter((app) => pinnedApps.includes(app.key));
    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>
                Pinned Apps
            </Typography>
            {pinned.length === 0 ? (
                <Typography color="text.secondary">No apps pinned. Use the pin icon next to an app in the sidebar for quick access.</Typography>
            ) : (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {pinned.map((app) => (
                        <Box key={app.key} sx={{ width: { xs: "100%", md: "calc(50% - 8px)" } }}>
                            <AppCard
                                app={app}
                                fullWidth
                            >
                                {appDetails?.[app.key]}
                            </AppCard>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}
