import { Card, CardActionArea, CardContent, Chip, Typography, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";

interface HubBoxProps {
    emoji: string;
    title: string;
    subtitle: string;
    statusChip?: { label: string; color?: "default" | "primary" | "success" | "warning" | "error" | "info" };
    onClick?: () => void;
}

function HubBox({ emoji, title, subtitle, statusChip, onClick }: HubBoxProps) {
    const comingSoon = !onClick;

    const content = (
        <CardContent
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.75,
                p: 1.75,
                "&:last-child": { pb: 1.75 },
                height: "100%",
            }}
        >
            <Typography sx={{ fontSize: 32, lineHeight: 1 }}>{emoji}</Typography>
            <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, textAlign: "center" }}>
                {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", flex: 1 }}>
                {subtitle}
            </Typography>
            {statusChip && (
                <Chip
                    label={statusChip.label}
                    size="small"
                    color={statusChip.color ?? "default"}
                    sx={{ fontWeight: 700, mt: "auto", fontSize: 11, height: 22 }}
                />
            )}
            {comingSoon && (
                <Chip
                    label="Coming soon"
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 700, fontSize: 11, height: 22, mt: "auto" }}
                />
            )}
        </CardContent>
    );

    if (comingSoon) {
        return (
            <Card sx={{ height: "100%", opacity: 0.6, cursor: "default" }}>
                {content}
            </Card>
        );
    }

    return (
        <Card
            sx={{
                height: "100%",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": { transform: "translateY(-4px)", boxShadow: 6 },
            }}
        >
            <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
                {content}
            </CardActionArea>
        </Card>
    );
}

export default function FarmHub() {
    const { creatures, feedCooldownMs } = useCasinoRanch();
    const navigate = useNavigate();

    const readyToFeed = creatures.filter((c) => {
        if (!c.lastFedAt) {
            return true;
        }
        return Date.now() - new Date(c.lastFedAt).getTime() >= feedCooldownMs;
    }).length;

    return (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 1 }}>
            <HubBox
                emoji="🐄"
                title="Barn"
                subtitle="Hatch, feed & collect"
                statusChip={{
                    label: `${creatures.length} creature${creatures.length === 1 ? "" : "s"}${readyToFeed > 0 ? ` · ${readyToFeed} ready` : ""}`,
                    color: readyToFeed > 0 ? "info" : "default",
                }}
                onClick={() => navigate("ranch")}
            />
            <HubBox
                emoji="🏁"
                title="Racetrack"
                subtitle="Race your creatures"
                onClick={() => navigate("race")}
            />
            <HubBox
                emoji="🌱"
                title="Garden"
                subtitle="Plant & harvest crops"
                onClick={() => navigate("garden")}
            />
            <HubBox
                emoji="⛏️"
                title="Mines"
                subtitle="Dig for treasure"
                onClick={() => navigate("mine")}
            />
            <HubBox
                emoji="🎒"
                title="Inventory"
                subtitle="View & manage items"
                onClick={() => navigate("inventory")}
            />
            <HubBox
                emoji="🛒"
                title="Store"
                subtitle="Buy feed & supplies"
                onClick={() => navigate("shop")}
            />
        </Box>
    );
}