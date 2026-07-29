import { ReactNode, useEffect, useState } from "react";
import {
    Alert,
    Avatar,
    Box,
    Button,
    CardActionArea,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PetsIcon from "@mui/icons-material/Pets";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SportsScoreIcon from "@mui/icons-material/SportsScore";
import SellIcon from "@mui/icons-material/Sell";
import SpeedIcon from "@mui/icons-material/Speed";
import BatteryChargingFullIcon from "@mui/icons-material/BatteryChargingFull";
import BoltIcon from "@mui/icons-material/Bolt";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import GrassIcon from "@mui/icons-material/Grass";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { RanchCreature, RanchItem, RanchRaceCategory, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";

// Ticks once a second for as long as `targetMs` is non-null, same pattern as Garden's
// watering cooldown badge - reads Date.now() fresh on every tick rather than trusting a
// slower page-level clock.
function useCountdown(targetMs: number | null): number {
    const [, tick] = useState(0);
    useEffect(() => {
        if (targetMs === null) {
            return;
        }
        const id = setInterval(() => tick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, [targetMs]);
    return targetMs === null ? 0 : Math.max(0, targetMs - Date.now());
}

function feedReadyAt(creature: RanchCreature, cooldownMs: number): number | null {
    return creature.lastFedAt ? new Date(creature.lastFedAt).getTime() + cooldownMs : null;
}

function collectReadyAt(creature: RanchCreature, cooldownMs: number): number | null {
    return creature.lastCollectedAt ? new Date(creature.lastCollectedAt).getTime() + cooldownMs : null;
}

function formatCountdown(msRemaining: number): string {
    if (msRemaining <= 0) {
        return "Ready";
    }
    const totalSeconds = Math.ceil(msRemaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Rarity-ordered so a glance at the color tells you roughly how good a creature is, same
// idea as Mine's TIER_COLOR for gems.
const TIER_COLOR: Record<string, string> = {
    common: "#b0b0b0",
    uncommon: "#4caf50",
    rare: "#2196f3",
    epic: "#9c27b0",
    legendary: "#ffd700",
};

const SPECIES_EMOJI: Record<string, string> = {
    common: "🐹",
    uncommon: "🐐",
    rare: "🦌",
    epic: "🦅",
    legendary: "🐉",
};

function StatTile({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color }}>
                {value}
            </Typography>
        </Box>
    );
}

interface ActionButtonProps {
    icon: ReactNode;
    label: string;
    description: ReactNode;
    color?: "primary" | "success" | "warning" | "error";
    disabled?: boolean;
    onClick: () => void;
}

// A full-width bordered button with a bold label on top and a plain-language description
// underneath - same shape as Garden/Mine's ActionButton, stays visible-but-disabled (not
// hidden) when unusable.
function ActionButton({ icon, label, description, color = "primary", disabled, onClick }: ActionButtonProps) {
    return (
        <Button
            fullWidth
            variant="outlined"
            color={color}
            disabled={disabled}
            onClick={onClick}
            startIcon={icon}
            sx={{
                justifyContent: "flex-start",
                textAlign: "left",
                textTransform: "none",
                py: 1,
                "& .MuiButton-startIcon": { alignSelf: "flex-start", mt: "3px" },
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                    {label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                    {description}
                </Typography>
            </Box>
        </Button>
    );
}

interface RanchCardProps {
    creature: RanchCreature;
    feedCooldownMs: number;
    onOpen: (id: string) => void;
}

function RanchCard({ creature, feedCooldownMs, onOpen }: RanchCardProps) {
    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const canFeed = cooldownRemaining <= 0;
    const total = creature.stats.speed + creature.stats.stamina + creature.stats.power;

    return (
        <CardActionArea
            onClick={() => onOpen(creature.id)}
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
            }}
        >
            <Typography sx={{ fontSize: 40, lineHeight: 1 }}>{SPECIES_EMOJI[creature.rarityTier] ?? "🐾"}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {creature.name}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.5 }}>
                <Chip
                    size="small"
                    label={creature.rarityTier}
                    sx={{ textTransform: "capitalize", fontWeight: 700, bgcolor: TIER_COLOR[creature.rarityTier], color: "#000" }}
                />
                <Chip
                    size="small"
                    icon={<MilitaryTechIcon sx={{ fontSize: "14px !important" }} />}
                    label={`Lv ${creature.level}`}
                    variant="outlined"
                />
            </Box>
            <Typography variant="caption" color="text.secondary">
                Total stats: {total}
            </Typography>
            <Chip
                size="small"
                icon={<RestaurantIcon sx={{ fontSize: "14px !important" }} />}
                label={canFeed ? "Ready to feed" : formatCountdown(cooldownRemaining)}
                color={canFeed ? "info" : "default"}
                variant={canFeed ? "filled" : "outlined"}
                sx={{ height: 20, fontSize: 11, fontWeight: 700, "& .MuiChip-label": { px: "6px" } }}
            />
        </CardActionArea>
    );
}

interface CreatureDetailsProps {
    creature: RanchCreature;
    feedCost: number;
    feedCooldownMs: number;
    raceEntryFee: number;
    raceWinMultiplier: number;
    releaseSellValue: Record<string, number>;
    raceCategories: RanchRaceCategory[];
    collectCooldownMs: number;
    onReleased: () => void;
}

function CreatureDetails({
    creature,
    feedCost,
    feedCooldownMs,
    raceEntryFee,
    raceWinMultiplier,
    releaseSellValue,
    raceCategories,
    collectCooldownMs,
    onReleased,
}: CreatureDetailsProps) {
    const { feed, isFeeding, race, isRacing, release, isReleasing, collect, isCollecting } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [confirmingRelease, setConfirmingRelease] = useState(false);
    const [category, setCategory] = useState(raceCategories[0]?.key ?? "");

    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const onCooldown = cooldownRemaining > 0;
    const collectCooldownRemaining = useCountdown(collectReadyAt(creature, collectCooldownMs));
    const canCollect = collectCooldownRemaining <= 0;
    const sellValue = releaseSellValue[creature.rarityTier] ?? 0;
    const xpIntoLevel = creature.xp % 100;

    const handleFeed = (statKey: "speed" | "stamina" | "power") =>
        feed({ creatureId: creature.id, statKey })
            .then((r) => enqueueSnackbar(`${creature.name} gained +${r.gain} ${statKey}!`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to feed", { variant: "error" }));

    const handleRace = () =>
        race({ creatureId: creature.id, category })
            .then((r) => {
                if (r.won) {
                    enqueueSnackbar(`${creature.name} won the race! +${formatCheddar(r.payout)} cheddar`, { variant: "success" });
                } else {
                    enqueueSnackbar(`${creature.name} lost the race (opponent total ${r.opponentTotal}).`, { variant: "error" });
                }
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to race", { variant: "error" }));

    const handleCollect = () =>
        collect(creature.id)
            .then((r) => enqueueSnackbar(`Collected ${r.item.quantity}x ${r.item.label}!`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to collect", { variant: "error" }));

    const handleRelease = () =>
        release(creature.id)
            .then((r) => {
                enqueueSnackbar(`Released ${creature.name} for ${formatCheddar(r.sellValue)} cheddar.`, { variant: "success" });
                onReleased();
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to release", { variant: "error" }));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, py: 0.5 }}>
                <Avatar sx={{ width: 64, height: 64, fontSize: 34, bgcolor: "action.hover" }}>
                    {SPECIES_EMOJI[creature.rarityTier] ?? "🐾"}
                </Avatar>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {creature.name}
                </Typography>
                <Chip
                    size="small"
                    label={creature.rarityTier}
                    sx={{ textTransform: "capitalize", fontWeight: 700, bgcolor: TIER_COLOR[creature.rarityTier], color: "#000" }}
                />
                <Chip size="small" icon={<MilitaryTechIcon />} label={`Level ${creature.level} (${xpIntoLevel}/100 XP)`} variant="outlined" />
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                <StatTile label="Speed" value={`${creature.stats.speed}/${creature.statCap}`} />
                <StatTile label="Stamina" value={`${creature.stats.stamina}/${creature.statCap}`} />
                <StatTile label="Power" value={`${creature.stats.power}/${creature.statCap}`} />
            </Box>

            <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
                <Chip size="small" color="success" label={`${creature.raceWins} Wins`} />
                <Chip size="small" color="error" label={`${creature.raceLosses} Losses`} />
            </Box>

            <ActionButton
                icon={<GrassIcon />}
                label={canCollect ? `Collect ${creature.level}x ${creature.itemLabel}` : `${creature.itemLabel} - collecting`}
                description={canCollect ? "Free - ready to collect" : `Ready again in ${formatCountdown(collectCooldownRemaining)}`}
                color="success"
                disabled={isCollecting || !canCollect}
                onClick={handleCollect}
            />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                    Feed ({formatCheddar(feedCost)}) - small random stat gain, capped at {creature.statCap}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SpeedIcon />}
                        disabled={isFeeding || onCooldown || creature.stats.speed >= creature.statCap}
                        onClick={() => handleFeed("speed")}
                    >
                        Speed
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<BatteryChargingFullIcon />}
                        disabled={isFeeding || onCooldown || creature.stats.stamina >= creature.statCap}
                        onClick={() => handleFeed("stamina")}
                    >
                        Stamina
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<BoltIcon />}
                        disabled={isFeeding || onCooldown || creature.stats.power >= creature.statCap}
                        onClick={() => handleFeed("power")}
                    >
                        Power
                    </Button>
                </Box>
                {onCooldown && (
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                        Feeding available again in {formatCountdown(cooldownRemaining)}
                    </Typography>
                )}

                <Typography variant="caption" color="text.secondary">
                    Race category - weights this creature's stats differently before the matchup
                </Typography>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={category}
                    onChange={(_, value) => value && setCategory(value)}
                    fullWidth
                >
                    {raceCategories.map((c) => (
                        <ToggleButton key={c.key} value={c.key} sx={{ textTransform: "none" }}>
                            {c.label}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
                <ActionButton
                    icon={<SportsScoreIcon />}
                    label={`Race (${formatCheddar(raceEntryFee)} entry)`}
                    description={`Win ${formatCheddar(Math.round(raceEntryFee * raceWinMultiplier))} cheddar against a generated opponent - odds scale with this creature's effective stats for the selected category.`}
                    color="warning"
                    disabled={isRacing || !category}
                    onClick={handleRace}
                />

                {!confirmingRelease ? (
                    <ActionButton
                        icon={<SellIcon />}
                        label={`Release for ${formatCheddar(sellValue)}`}
                        description="Permanently removes this creature from your roster in exchange for a flat cheddar payout."
                        color="error"
                        disabled={isReleasing}
                        onClick={() => setConfirmingRelease(true)}
                    />
                ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "error.main", borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Release {creature.name} for {formatCheddar(sellValue)}? This can't be undone.
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1 }}>
                            <Button variant="outlined" fullWidth disabled={isReleasing} onClick={() => setConfirmingRelease(false)}>
                                Cancel
                            </Button>
                            <Button variant="contained" color="error" fullWidth disabled={isReleasing} onClick={handleRelease}>
                                Confirm Release
                            </Button>
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

interface ItemsPanelProps {
    items: RanchItem[];
}

// A simple stack list - each row sells the entire stack for cheddar, or "uses" one unit
// (a stub for now, no effect - see the /use route comment in casinoRanch.ts).
function ItemsPanel({ items }: ItemsPanelProps) {
    const { sellItem, isSellingItem, useItem, isUsingItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleSell = (key: string, label: string) =>
        sellItem(key)
            .then((r) => enqueueSnackbar(`Sold ${r.quantity}x ${label} for ${formatCheddar(r.totalValue)} cheddar.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to sell", { variant: "error" }));

    const handleUse = (key: string) =>
        useItem(key)
            .then((r) => enqueueSnackbar(r.message, { variant: "info" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to use item", { variant: "error" }));

    if (items.length === 0) {
        return null;
    }

    return (
        <Box sx={{ mt: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <Inventory2Icon fontSize="small" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Ranch Items
                </Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {items.map((item) => (
                    <Box
                        key={item.key}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                            p: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1.5,
                        }}
                    >
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {item.label} x{item.quantity}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {formatCheddar(item.sellValue)} each
                            </Typography>
                        </Box>
                        <Box sx={{ display: "flex", gap: 1 }}>
                            <Button size="small" variant="outlined" disabled={isUsingItem} onClick={() => handleUse(item.key)}>
                                Use
                            </Button>
                            <Button
                                size="small"
                                variant="contained"
                                startIcon={<SellIcon />}
                                disabled={isSellingItem}
                                onClick={() => handleSell(item.key, item.label)}
                            >
                                Sell All ({formatCheddar(item.quantity * item.sellValue)})
                            </Button>
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

export default function CheddarRanch() {
    const {
        creatures,
        items,
        rarityTiers,
        raceCategories,
        hatchPrice,
        feedCost,
        feedCooldownMs,
        raceEntryFee,
        raceWinMultiplier,
        releaseSellValue,
        collectCooldownMs,
        isLoading,
        isError,
        error,
        refetch,
        hatch,
        isHatching,
    } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selectedCreature = creatures.find((c) => c.id === selectedId) ?? null;

    const handleHatch = () =>
        hatch()
            .then((r) => {
                enqueueSnackbar(`Hatched a ${r.creature.rarityTier} ${r.creature.name}!`, { variant: "success" });
                setSelectedId(r.creature.id);
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to hatch", { variant: "error" }));

    const oddsSections: OddsSection[] = [
        {
            title: "Rarity Tiers",
            rows: rarityTiers.map((t) => ({
                label: `${t.label} (${(t.probability * 100).toFixed(0)}% chance)`,
                payout: `Stats ${t.statRange[0]}-${t.statRange[1]}, cap ${t.statCap}`,
            })),
            footnote: `Hatching a Cheddar Egg costs ${formatCheddar(hatchPrice)} and draws one of these five rarity tiers - a rarer tier means a higher starting stat roll and a higher training ceiling, both locked in for that creature forever. Feeding costs ${formatCheddar(
                feedCost
            )} and raises one stat by a small random amount (capped at the creature's own ceiling), with a cooldown between feedings, and also earns XP. Releasing a creature pays a flat cheddar amount based on its rarity and removes it from your roster for good.`,
        },
        {
            title: "Race Categories",
            rows: raceCategories.map((c) => ({
                label: c.label,
                payout: `Weights speed x${c.weights.speed}, stamina x${c.weights.stamina}, power x${c.weights.power}`,
            })),
            footnote: `Racing costs ${formatCheddar(
                raceEntryFee
            )} to enter and pays ${raceWinMultiplier}x on a win. Each category weights a creature's stats differently before computing odds against a generated opponent, so a fast-but-frail creature does best in Sprint, a tough one in Brawl, and so on. Racing (win or lose) earns XP - every 100 XP is a level, and a creature's level increases how much of its item it produces per collection.`,
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

    return (
        <GameWrapper
            title="Cheddar Ranch"
            howToPlay="Hatch a Cheddar Egg to add a creature to your roster - rarity is randomized, and better tiers roll higher stats and a higher training ceiling. Tap a creature to feed it (raises one stat a little, on a cooldown, and earns XP), collect its item for free once every 24 hours (every species produces its own item, and how much you get scales with the creature's level), enter it in a race (pick a category that suits its stats for a shot at a cheddar payout, win or lose earns XP), or release it for a flat cheddar payout based on its rarity. Collected items show up below your roster, where you can sell the whole stack for cheddar or use one (no effect yet)."
            oddsSections={oddsSections}
        >
            <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<PetsIcon />}
                    disabled={isHatching}
                    onClick={handleHatch}
                    sx={{ textTransform: "none" }}
                >
                    Hatch Cheddar Egg ({formatCheddar(hatchPrice)})
                </Button>
            </Box>

            {isLoading ? (
                <LinearProgress sx={{ mt: 2 }} />
            ) : creatures.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 2 }}>
                    Your roster is empty - hatch your first creature above.
                </Typography>
            ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 2, mt: 2 }}>
                    {creatures.map((creature) => (
                        <RanchCard key={creature.id} creature={creature} feedCooldownMs={feedCooldownMs} onOpen={setSelectedId} />
                    ))}
                </Box>
            )}

            <ItemsPanel items={items} />

            <Dialog
                open={!!selectedCreature}
                onClose={() => setSelectedId(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Creature Details
                    <IconButton onClick={() => setSelectedId(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3 }}>
                    {selectedCreature && (
                        <CreatureDetails
                            creature={selectedCreature}
                            feedCost={feedCost}
                            feedCooldownMs={feedCooldownMs}
                            raceEntryFee={raceEntryFee}
                            raceWinMultiplier={raceWinMultiplier}
                            releaseSellValue={releaseSellValue}
                            raceCategories={raceCategories}
                            collectCooldownMs={collectCooldownMs}
                            onReleased={() => setSelectedId(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </GameWrapper>
    );
}
