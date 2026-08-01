import { SxProps, Theme, Box, Card, CardContent, Typography, LinearProgress } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useSnackbar } from "notistack";
import { useCasinoDailyQuest } from "../../../../hooks/casino/useCasinoDailyQuest";
import { formatCheddar } from "../utils/currency";

interface DailyQuestCardProps {
    sx?: SxProps<Theme>;
}

// Three daily quests stacked vertically at the top of the games list:
// - Play 5 different games → 10k
// - Play 10 rounds → 10k
// - Play 20 rounds → 50k
// Each tracks independently and can be claimed separately. Progress resets at UTC midnight.
export default function DailyQuestCard({ sx }: DailyQuestCardProps) {
    const { enqueueSnackbar } = useSnackbar();
    const { quests, isLoading, claim, isClaiming } = useCasinoDailyQuest();

    if (isLoading && quests.length === 0) {
        return null;
    }

    const handleClaim = async (key: string) => {
        try {
            const result = await claim(key);
            enqueueSnackbar(`Claimed! +${formatCheddar(result.reward)} cheddar`, { variant: "success" });
        } catch (error) {
            enqueueSnackbar((error as Error).message || "Failed to claim", { variant: "error" });
        }
    };

    return (
        <Card
            variant="outlined"
            sx={{
                borderColor: "divider",
                borderWidth: 1,
                ...sx,
            }}
        >
            <CardContent sx={{ p: "6px 12px !important", "&:last-child": { pb: "6px !important" } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                    <EmojiEventsIcon sx={{ fontSize: 16, color: "warning.main" }} />
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        Daily Quests
                    </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1 }}>
                    {quests.map((quest) => {
                        const progress = quest.target > 0 ? Math.min(100, (quest.progress / quest.target) * 100) : 0;
                        return (
                            <Box
                                key={quest.key}
                                onClick={quest.canClaim && !isClaiming ? () => handleClaim(quest.key) : undefined}
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    p: 0.75,
                                    borderRadius: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "space-between",
                                    minHeight: 120,
                                    cursor: quest.canClaim ? "pointer" : "default",
                                    bgcolor: quest.claimed ? "action.disabledBackground" : "action.hover",
                                    border: quest.canClaim ? "2px solid" : "1px solid",
                                    borderColor: quest.canClaim ? "warning.main" : "divider",
                                    boxShadow: quest.canClaim ? "0 0 10px 1px rgba(255,193,7,0.3)" : "none",
                                    opacity: quest.claimed ? 0.55 : 1,
                                    transition: "box-shadow 0.2s, border-color 0.2s",
                                    "&:hover": quest.canClaim ? {
                                        boxShadow: "0 0 18px 3px rgba(255,193,7,0.5)",
                                        borderColor: "warning.light",
                                    } : {},
                                }}
                            >
                                <Typography variant="caption" sx={{ fontWeight: 600, display: "block", lineHeight: 1.3, textAlign: "center" }}>
                                    {quest.label}
                                </Typography>
                                <Box>
                                    {quest.claimed && (
                                        <Typography variant="caption" sx={{ display: "block", textAlign: "center", mb: 0.25, fontStyle: "italic", color: "text.secondary" }}>
                                            Claimed
                                        </Typography>
                                    )}
                                    {!quest.claimed && !quest.canClaim ? null : (
                                        <Typography variant="caption" sx={{ display: "block", textAlign: "center", fontWeight: 500 }}>
                                            🧀{quest.reward.toLocaleString()}
                                        </Typography>
                                    )}
                                    {quest.canClaim ? (
                                        <Typography variant="caption" sx={{ display: "block", textAlign: "center", mt: 0.5, fontWeight: 800, color: "warning.main" }}>
                                            Claim
                                        </Typography>
                                    ) : quest.claimed ? null : (
                                        <>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center" }}>
                                                {quest.progress}/{quest.target}
                                            </Typography>
                                            <LinearProgress
                                                variant="determinate"
                                                value={progress}
                                                color="primary"
                                                sx={{ height: 6, borderRadius: 999, my: 0.25 }}
                                            />
                                            <Typography variant="caption" sx={{ display: "block", textAlign: "center", fontWeight: 500 }}>
                                                🧀{quest.reward.toLocaleString()}
                                            </Typography>
                                        </>
                                    )}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            </CardContent>
        </Card>
    );
}
