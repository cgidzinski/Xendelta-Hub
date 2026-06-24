import { Card, CardContent, Typography, Box, Avatar } from "@mui/material";
import { AppRegistryItem } from "../../../../constants/apps";

interface AppCardProps {
    app: AppRegistryItem;
    children?: React.ReactNode;
    fullWidth?: boolean;
}

export default function AppCard({ app, children, fullWidth }: AppCardProps) {
    return (
        <Card
            variant="outlined"
            sx={{
                borderRadius: 2,
                width: fullWidth ? "100%" : undefined,
                display: "flex",
                flexDirection: "column",
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, pt: 2, pb: 1 }}>
                <Avatar sx={{ bgcolor: "primary.light", width: 36, height: 36 }}>
                    {app.icon && <app.icon sx={{ fontSize: 22 }} />}
                </Avatar>
                <Typography variant="h6" sx={{ flex: 1 }}>
                    {app.label}
                </Typography>
            </Box>
            {children && (
                <CardContent sx={{ pt: 0 }}>
                    {children}
                </CardContent>
            )}
        </Card>
    );
}
