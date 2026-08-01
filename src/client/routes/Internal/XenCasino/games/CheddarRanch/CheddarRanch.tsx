import { useState } from "react";
import { Alert, Box, Button, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";
import FarmHub, { FarmView } from "./FarmHub";
import RanchTab from "./RanchTab";
import RaceTab from "./RaceTab";
import InventoryTab from "./InventoryTab";
import ShopTab from "./ShopTab";

const VIEW_LABEL: Record<FarmView, string> = {
    ranch: "Barn",
    race: "Racetrack",
    inventory: "Inventory",
    shop: "Store",
};

export default function CheddarRanch() {
    const { items, rarityTiers, raceCourses, hatchPrice, minRaceStake, maxRaceStake, entryFee, isError, error, refetch } = useCasinoRanch();
    const [view, setView] = useState<FarmView | "hub">("hub");

    const oddsSections: OddsSection[] = [
        {
            title: "Rarity Tiers",
            rows: rarityTiers.map((t) => ({
                label: `${t.label} (${(t.probability * 100).toFixed(0)}% chance)`,
                payout: `Stats ${t.statRange[0]}-${t.statRange[1]}`,
            })),
            footnote: `Hatching a Cheddar Egg costs ${formatCheddar(hatchPrice)} and draws one of these five rarity tiers - a rarer tier means a higher starting roll across all 6 stats (Speed/Stamina/Power/Intelligence/Luck/Charm). There's no stat ceiling: feeding always raises every stat, but a creature left unfed too long will slowly lose stats until fed again. Level is always the average of a creature's current 6 stats, so it moves with both feeding and neglect.`,
        },
        {
            title: "Race Courses",
            rows: raceCourses.map((c) => ({
                label: c.label,
                payout: `Weights Spd x${c.weights.speed} / Sta x${c.weights.stamina} / Pwr x${c.weights.power} / Int x${c.weights.intelligence} / Lck x${c.weights.luck} / Chr x${c.weights.charm}`,
            })),
            footnote: `On the Racetrack, paying the flat ${formatCheddar(
                entryFee
            )} entry fee (non-refundable once paid, even if you forfeit) randomizes both the course - which weights the 6 stats differently - and your 4 rivals, then reveals real bookmaker-style odds for all 5 racers. You can then bet ${formatCheddar(
                minRaceStake
            )}-${formatCheddar(
                maxRaceStake
            )} on any one of the 5 to win - a favorite pays a lower multiplier, a longshot pays a higher one - or forfeit and walk away (still losing the entry fee). Your own creature's win/loss record and level track whether it actually placed first, independent of who you bet on.`,
        },
    ];

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

    const howToPlay =
        "Barn: tap the + tile to hatch a Cheddar Egg (rarity, species, and Land/Sea/Air type are randomized). Feed a creature with the Feed matching its own type to raise every stat by a random amount - higher-level creatures need more Feed per feeding (1h cooldown between feedings), and a creature left unfed too long slowly loses stats. Collect its item once per day (resets at midnight — a fixed amount for its rarity tier). But collect from the same creature twice in a row without racing it and it'll refuse to produce again until it races, win or lose. Or release a creature for a flat cheddar payout. Racetrack: pick a creature and pay the entry fee to randomize the course and reveal 4 rivals all at once, then bet on any of the 5 racers (including your own) and watch the race play out - or forfeit if you don't like your odds (the entry fee is gone either way). Your own creature's record and level track whether it actually placed first, regardless of who you bet on. Inventory: tap an item for details, then sell the stack for cheddar or use one. Store: buy Land/Sea/Air Feed, tonics, and other supplies.";

    return (
        <GameWrapper
            title="Cheddar Ranch"
            howToPlay={howToPlay}
            oddsSections={oddsSections}
        >
            {view !== "hub" && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <IconButton onClick={() => setView("hub")} aria-label="Back to farm" size="small">
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {VIEW_LABEL[view]}
                    </Typography>
                </Box>
            )}

            {view === "hub" && <FarmHub onNavigate={(v) => setView(v)} />}
            {view === "ranch" && <RanchTab />}
            {view === "race" && <RaceTab />}
            {view === "inventory" && <InventoryTab items={items} />}
            {view === "shop" && <ShopTab />}
        </GameWrapper>
    );
}