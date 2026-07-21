import { SxProps, Theme, Box, Card, CardContent, Typography, LinearProgress, Button } from "@mui/material";
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
    const { target, roundsPlayed, claimed, canClaim, reward, isLoading, claim, isClaiming } = useCasinoDailyQuest();

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
            <CardContent sx={{ p: "12px 16px !important" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                    <EmojiEventsIcon fontSize="small" sx={{ color: "warning.main", flexShrink: 0 }} />

                    <Box sx={{ flexShrink: 0 }}>
                        <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
                            Daily Quest
                        </Typography>
                        <Typography variant="body2" component="span" color="text.secondary" sx={{ ml: 1 }}>
                            {claimed
                                ? "Reward claimed - come back tomorrow."
                                : `Play ${target} rounds today for ${formatCheddar(reward)} cheddar`}
                        </Typography>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 120 }}>
                        <Box sx={{ flex: 1, minWidth: 60 }}>
                            <LinearProgress
                                variant="determinate"
                                value={progress}
                                color={canClaim ? "warning" : "primary"}
                                sx={{ height: 6, borderRadius: 999 }}
                            />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {Math.min(roundsPlayed, target)}/{target}
                        </Typography>
                        <Button
                            variant="contained"
                            color="warning"
                            size="small"
                            disabled={!canClaim || isClaiming}
                            onClick={handleClaim}
                            sx={{ borderRadius: 999, px: 2, fontWeight: 800, minWidth: 80 }}
                        >
                            {claimed ? "Claimed" : canClaim ? "Claim" : "Play"}
                        </Button>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}
