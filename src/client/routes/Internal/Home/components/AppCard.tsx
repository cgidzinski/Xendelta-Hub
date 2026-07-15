import { Card, CardActionArea, CardContent, Typography, Box, Avatar } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { AppRegistryItem } from "../../../../constants/apps";

interface AppCardProps {
    app: AppRegistryItem;
    children?: React.ReactNode;
    fullWidth?: boolean;
}

export default function AppCard({ app, children, fullWidth }: AppCardProps) {
    const navigate = useNavigate();

    return (
        <Card
            variant="outlined"
            sx={{
                borderRadius: 2,
                width: fullWidth ? "100%" : undefined,
            }}
        >
            <CardActionArea onClick={() => navigate(app.path)} sx={{ p: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, pt: 2, pb: children ? 0 : 2 }}>
                    <Avatar sx={{ bgcolor: "primary.light", width: 36, height: 36 }}>
                        {app.icon && <app.icon sx={{ fontSize: 22 }} />}
                    </Avatar>
                    <Typography variant="h6" sx={{ flex: 1 }}>
                        {app.label}
                    </Typography>
                </Box>
                {children && (
                    <CardContent sx={{ pt: 1 }}>
                        {children}
                    </CardContent>
                )}
            </CardActionArea>
        </Card>
    );
}
