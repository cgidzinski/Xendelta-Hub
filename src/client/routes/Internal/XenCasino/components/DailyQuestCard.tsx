import { SxProps, Theme, Box, Card, CardContent, Typography, LinearProgress, Button, Avatar } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useSnackbar } from "notistack";
import { useCasinoDailyQuest } from "../../../../hooks/casino/useCasinoDailyQuest";
import { formatCheddar } from "../utils/currency";

interface DailyQuestCardProps {
    sx?: SxProps<Theme>;
}

// "Play N casino rounds today" - any game counts (slots, scratch, plinko, ...), tracked
// server-side and reset lazily at UTC midnight (see XenCasinoUserState). Sits at the top
// of the games list since that's the natural landing spot to notice it before picking a
// game to actually play.
export default function DailyQuestCard({ sx }: DailyQuestCardProps) {
    const { enqueueSnackbar } = useSnackbar();
    const { target, roundsPlayed, claimed, canClaim, isLoading, claim, isClaiming } = useCasinoDailyQuest();

    if (isLoading && target === 0) {
        return null;
    }

    const progress = target > 0 ? Math.min(100, (roundsPlayed / target) * 100) : 0;

    const handleClaim = async () => {
        try {
            const result = await claim();
            enqueueSnackbar(`Claimed! Balance: ${formatCheddar(result.balance)} cheddar`, { variant: "success" });
        } catch (error) {
            enqueueSnackbar((error as Error).message || "Failed to claim", { variant: "error" });
        }
    };

    return (
        <Card
            variant="outlined"
            sx={{
                borderColor: canClaim ? "warning.main" : "divider",
                borderWidth: canClaim ? 2 : 1,
                ...sx,
            }}
        >
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                <Avatar sx={{ bgcolor: "action.hover", color: "warning.main", width: 40, height: 40, flexShrink: 0 }}>
                    <EmojiEventsIcon fontSize="small" />
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Daily Quest
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {claimed ? "Reward claimed - come back tomorrow." : `Play ${target} XenCasino rounds today`}
                    </Typography>
                    <LinearProgress
                        variant="determinate"
                        value={progress}
                        color={canClaim ? "warning" : "primary"}
                        sx={{ height: 8, borderRadius: 999 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        {Math.min(roundsPlayed, target)}/{target} rounds played
                    </Typography>
                </Box>

                <Button
                    variant="contained"
                    color="warning"
                    disabled={!canClaim || isClaiming}
                    onClick={handleClaim}
                    sx={{ borderRadius: 999, px: 3, fontWeight: 800, flexShrink: 0 }}
                >
                    {claimed ? "Claimed" : canClaim ? "Claim" : "In Progress"}
                </Button>
            </CardContent>
        </Card>
    );
}
