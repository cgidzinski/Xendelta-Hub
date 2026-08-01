import { Alert, Box, Button, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import GameWrapper, { HelpTab, OddsSection } from "../../components/GameWrapper";
import OddsDisplay from "../../components/OddsDisplay";
import { formatCheddar } from "../../utils/currency";
import { useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";
import FarmHub from "./FarmHub";

const VIEW_LABEL: Record<string, string> = {
    ranch: "Barn",
    race: "Racetrack",
    inventory: "Inventory",
    shop: "Store",
    mine: "Mines",
};

export default function CheddarRanch() {
    const { items, rarityTiers, raceCourses, hatchPrice, minRaceStake, maxRaceStake, entryFee, isError, error, refetch } = useCasinoRanch();
    const location = useLocation();
    const navigate = useNavigate();

    // Determine if we're on a sub-route or the hub
    const pathParts = location.pathname.replace(/\/$/, "").split("/");
    const subView = pathParts[pathParts.length - 1];
    const isHub = subView === "cheddar-ranch";

    const howToPlay = "Cheddar Ranch — hatch creatures, race them, dig for ore, collect items, and buy supplies.";

    const helpTabs: HelpTab[] = [
        {
            label: "Barn",
            content: (
                <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Tap + to hatch a Cheddar Egg — rarity, species, and Land/Sea/Air type are randomized. Feed with matching-type Feed to raise all stats (1h cooldown). Higher-level creatures cost more Feed. Collect items once per day, but collecting twice without racing locks the creature until it races. Release for cheddar. Unfed creatures slowly decay.
                    </Typography>
                    <OddsDisplay
                        title="Rarity Tiers"
                        rows={rarityTiers.map((t) => ({ label: `${t.label} (${(t.probability * 100).toFixed(0)}% chance)`, payout: `Stats ${t.statRange[0]}-${t.statRange[1]}` }))}
                        footnote={`Hatching costs ${formatCheddar(hatchPrice)}. Rarer = higher starting stats.`}
                    />
                </>
            ),
        },
        {
            label: "Racetrack",
            content: (
                <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Pay {formatCheddar(entryFee)} entry fee (non-refundable). Course and 4 rivals are randomized, then odds are shown. Bet {formatCheddar(minRaceStake)}–{formatCheddar(maxRaceStake)} on any racer or forfeit. Your creature's record tracks its own performance independent of your bet.
                    </Typography>
                    <OddsDisplay
                        title="Race Courses"
                        rows={raceCourses.map((c) => ({ label: c.label, payout: `Spd x${c.weights.speed} / Sta x${c.weights.stamina} / Pwr x${c.weights.power} / Int x${c.weights.intelligence} / Lck x${c.weights.luck} / Chr x${c.weights.charm}` }))}
                        footnote={`Entry ${formatCheddar(entryFee)}. Bet ${formatCheddar(minRaceStake)}–${formatCheddar(maxRaceStake)}.`}
                    />
                </>
            ),
        },
        {
            label: "Mines",
            content: (
                <Typography variant="body2" color="text.secondary">
                    15 actions/day. Free moves through cleared tunnels. New digs cost cheddar + 1 action. Up/down needs a Ladder. Heavy stone needs an Explosive. Supports block cave-ins. Flares reveal 3×3. Deeper = rarer ores. Ores go to Inventory.
                </Typography>
            ),
        },
        {
            label: "Inventory",
            content: (
                <Typography variant="body2" color="text.secondary">
                    Tap items to sell for cheddar or use them. Creature materials can be sold or crafted into Tonics. Ores from Mines appear here too.
                </Typography>
            ),
        },
        {
            label: "Store",
            content: (
                <Typography variant="body2" color="text.secondary">
                    Buy Feed, Tonics, Type-Swap Serum, Decay Shield, Course Ticket, Hardened Feed, and Forfeit Insurance. Craft Tonics for free from materials.
                </Typography>
            ),
        },
    ];

    const barnOdds: OddsSection = {
        title: "Rarity Tiers",
        rows: rarityTiers.map((t) => ({ label: `${t.label} (${(t.probability * 100).toFixed(0)}% chance)`, payout: `Stats ${t.statRange[0]}-${t.statRange[1]}` })),
        footnote: `Hatching costs ${formatCheddar(hatchPrice)}.`,
    };
    const raceOdds: OddsSection = {
        title: "Race Courses",
        rows: raceCourses.map((c) => ({ label: c.label, payout: `Spd x${c.weights.speed} / Sta x${c.weights.stamina} / Pwr x${c.weights.power} / Int x${c.weights.intelligence} / Lck x${c.weights.luck} / Chr x${c.weights.charm}` })),
        footnote: `Entry ${formatCheddar(entryFee)}. Bet ${formatCheddar(minRaceStake)}–${formatCheddar(maxRaceStake)}.`,
    };

    const viewOdds: Record<string, OddsSection[]> = {
        "cheddar-ranch": [barnOdds, raceOdds],
        ranch: [barnOdds],
        race: [raceOdds],
        mine: [],
        inventory: [],
        shop: [],
    };

    if (isError) {
        return (
            <GameWrapper title="Cheddar Ranch" howToPlay="Loading..." oddsSections={[]}>
                <Alert
                    severity="error"
                    sx={{ mt: 4 }}
                    action={
                        <Button color="inherit" size="small" onClick={() => refetch()}>
                            Retry
                        </Button>
                    }
                >
                    {error?.message || "Failed to load the ranch"}
                </Alert>
            </GameWrapper>
        );
    }

    return (
        <GameWrapper
            title="Cheddar Ranch"
            howToPlay={howToPlay}
            helpTabs={helpTabs}
            oddsSections={(viewOdds[subView] ?? viewOdds["cheddar-ranch"])}
        >
            {!isHub && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <IconButton onClick={() => navigate("/internal/xencasino/games/cheddar-ranch")} aria-label="Back to farm" size="small">
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                        {VIEW_LABEL[subView] ?? subView}
                    </Typography>
                    {subView === "mine" && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                            🧀 {formatCheddar(250)} / dig
                        </Typography>
                    )}
                </Box>
            )}

            {isHub && <FarmHub />}
            <Outlet context={{ items }} />
        </GameWrapper>
    );
}