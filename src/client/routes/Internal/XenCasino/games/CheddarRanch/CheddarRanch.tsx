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
    Tab,
    Tabs,
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
import StorefrontIcon from "@mui/icons-material/Storefront";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { RanchCreature, RanchItem, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";

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
    selected?: boolean;
    onClick: (id: string) => void;
}

// The compact roster tile - reused both in the Ranch tab (tapping opens the feed/collect/
// release dialog) and the Race tab (tapping just selects which creature to enter, shown via
// the `selected` highlight instead of opening anything).
function RanchCard({ creature, feedCooldownMs, selected, onClick }: RanchCardProps) {
    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const canFeed = cooldownRemaining <= 0;
    const total = creature.stats.speed + creature.stats.stamina + creature.stats.power;

    return (
        <CardActionArea
            onClick={() => onClick(creature.id)}
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                p: 2,
                borderRadius: 2,
                border: selected ? "2px solid" : "1px solid",
                borderColor: selected ? "primary.main" : "divider",
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
    feedCooldownMs: number;
    releaseSellValue: Record<string, number>;
    collectCooldownMs: number;
    onReleased: () => void;
}

// Ranch-tab dialog - feed/collect/release only. Racing lives entirely on the Race tab now.
function CreatureDetails({ creature, feedCooldownMs, releaseSellValue, collectCooldownMs, onReleased }: CreatureDetailsProps) {
    const { feed, isFeeding, release, isReleasing, collect, isCollecting, feedItems } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [confirmingRelease, setConfirmingRelease] = useState(false);

    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const onCooldown = cooldownRemaining > 0;
    const collectCooldownRemaining = useCountdown(collectReadyAt(creature, collectCooldownMs));
    const canCollect = collectCooldownRemaining <= 0;
    const sellValue = releaseSellValue[creature.rarityTier] ?? 0;
    const xpIntoLevel = creature.xp % 100;

    const feedItemFor = (statKey: "speed" | "stamina" | "power") => feedItems.find((f) => f.statKey === statKey);

    const handleFeed = (statKey: "speed" | "stamina" | "power") =>
        feed({ creatureId: creature.id, statKey })
            .then((r) => enqueueSnackbar(`${creature.name} gained +${r.gain} ${statKey}!`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to feed", { variant: "error" }));

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
                <Box sx={{ display: "flex", gap: 1 }}>
                    <Chip
                        size="small"
                        label={creature.rarityTier}
                        sx={{ textTransform: "capitalize", fontWeight: 700, bgcolor: TIER_COLOR[creature.rarityTier], color: "#000" }}
                    />
                    <Chip size="small" icon={<MilitaryTechIcon />} label={`Level ${creature.level} (${xpIntoLevel}/100 XP)`} variant="outlined" />
                </Box>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                <StatTile label="Speed" value={creature.stats.speed} />
                <StatTile label="Stamina" value={creature.stats.stamina} />
                <StatTile label="Power" value={creature.stats.power} />
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
                    Feed - uses one matching Feed item from your Inventory (buy more in the Shop). No stat ceiling.
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SpeedIcon />}
                        disabled={isFeeding || onCooldown || (feedItemFor("speed")?.quantity ?? 0) <= 0}
                        onClick={() => handleFeed("speed")}
                    >
                        Speed ({feedItemFor("speed")?.quantity ?? 0})
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<BatteryChargingFullIcon />}
                        disabled={isFeeding || onCooldown || (feedItemFor("stamina")?.quantity ?? 0) <= 0}
                        onClick={() => handleFeed("stamina")}
                    >
                        Stamina ({feedItemFor("stamina")?.quantity ?? 0})
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<BoltIcon />}
                        disabled={isFeeding || onCooldown || (feedItemFor("power")?.quantity ?? 0) <= 0}
                        onClick={() => handleFeed("power")}
                    >
                        Power ({feedItemFor("power")?.quantity ?? 0})
                    </Button>
                </Box>
                {onCooldown && (
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                        Feeding available again in {formatCountdown(cooldownRemaining)}
                    </Typography>
                )}

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

function RanchTab() {
    const { creatures, hatchPrice, feedCooldownMs, releaseSellValue, collectCooldownMs, isLoading, hatch, isHatching } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selectedCreature = creatures.find((c) => c.id === selectedId) ?? null;

    const handleHatch = () =>
        hatch()
            .then((r) => enqueueSnackbar(`Hatched a ${r.creature.rarityTier} ${r.creature.name}!`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to hatch", { variant: "error" }));

    return (
        <Box>
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
                        <RanchCard key={creature.id} creature={creature} feedCooldownMs={feedCooldownMs} onClick={setSelectedId} />
                    ))}
                </Box>
            )}

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
                            feedCooldownMs={feedCooldownMs}
                            releaseSellValue={releaseSellValue}
                            collectCooldownMs={collectCooldownMs}
                            onReleased={() => setSelectedId(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}

function RaceTab() {
    const { creatures, raceCategories, raceEntryFee, raceWinMultiplier, feedCooldownMs, race, isRacing } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [category, setCategory] = useState(raceCategories[0]?.key ?? "");

    useEffect(() => {
        if (!category && raceCategories.length > 0) {
            setCategory(raceCategories[0].key);
        }
    }, [raceCategories, category]);

    const selectedCreature = creatures.find((c) => c.id === selectedId) ?? null;

    const handleRace = () => {
        if (!selectedCreature) {
            return;
        }
        race({ creatureId: selectedCreature.id, category })
            .then((r) => {
                if (r.won) {
                    enqueueSnackbar(`${selectedCreature.name} won the race! +${formatCheddar(r.payout)} cheddar`, { variant: "success" });
                } else {
                    enqueueSnackbar(`${selectedCreature.name} lost the race (opponent total ${r.opponentTotal}).`, { variant: "error" });
                }
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to race", { variant: "error" }));
    };

    if (creatures.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 2 }}>
                You don't have any creatures yet - hatch one on the Ranch tab first.
            </Typography>
        );
    }

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Pick a creature to enter
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 2, mb: 3 }}>
                {creatures.map((creature) => (
                    <RanchCard
                        key={creature.id}
                        creature={creature}
                        feedCooldownMs={feedCooldownMs}
                        selected={creature.id === selectedId}
                        onClick={setSelectedId}
                    />
                ))}
            </Box>

            {selectedCreature && (
                <Box sx={{ maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                        Race category - weights {selectedCreature.name}'s stats differently before the matchup
                    </Typography>
                    <ToggleButtonGroup size="small" exclusive value={category} onChange={(_, value) => value && setCategory(value)} fullWidth>
                        {raceCategories.map((c) => (
                            <ToggleButton key={c.key} value={c.key} sx={{ textTransform: "none" }}>
                                {c.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    <ActionButton
                        icon={<SportsScoreIcon />}
                        label={`Race (${formatCheddar(raceEntryFee)} entry)`}
                        description={`Win ${formatCheddar(Math.round(raceEntryFee * raceWinMultiplier))} cheddar against a generated opponent - odds scale with ${selectedCreature.name}'s effective stats for the selected category.`}
                        color="warning"
                        disabled={isRacing || !category}
                        onClick={handleRace}
                    />
                </Box>
            )}
        </Box>
    );
}

function InventoryTab({ items }: { items: RanchItem[] }) {
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
        return (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 2 }}>
                No items yet - collect from a creature on the Ranch tab.
            </Typography>
        );
    }

    return (
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
    );
}

function ShopTab() {
    const { feedItems, buyFeedItem, isBuyingFeedItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuy = (key: string, label: string) =>
        buyFeedItem(key)
            .then(() => enqueueSnackbar(`Bought 1x ${label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {feedItems.map((item) => (
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
                            {item.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            You own {item.quantity} - feeds the matching stat with no ceiling
                        </Typography>
                    </Box>
                    <Button
                        size="small"
                        variant="contained"
                        startIcon={<RestaurantIcon />}
                        disabled={isBuyingFeedItem}
                        onClick={() => handleBuy(item.key, item.label)}
                    >
                        Buy ({formatCheddar(item.price)})
                    </Button>
                </Box>
            ))}
        </Box>
    );
}

type TabKey = "ranch" | "race" | "inventory" | "shop";

export default function CheddarRanch() {
    const { items, rarityTiers, raceCategories, hatchPrice, raceEntryFee, raceWinMultiplier, isError, error, refetch } = useCasinoRanch();
    const [tab, setTab] = useState<TabKey>("ranch");

    const oddsSections: OddsSection[] = [
        {
            title: "Rarity Tiers",
            rows: rarityTiers.map((t) => ({
                label: `${t.label} (${(t.probability * 100).toFixed(0)}% chance)`,
                payout: `Stats ${t.statRange[0]}-${t.statRange[1]}`,
            })),
            footnote: `Hatching a Cheddar Egg costs ${formatCheddar(hatchPrice)} and draws one of these five rarity tiers - a rarer tier means a higher starting stat roll. There's no stat ceiling: feeding always raises a stat, for as long as you keep feeding it.`,
        },
        {
            title: "Race Categories",
            rows: raceCategories.map((c) => ({
                label: c.label,
                payout: `Weights speed x${c.weights.speed}, stamina x${c.weights.stamina}, power x${c.weights.power}`,
            })),
            footnote: `Racing (on the Race tab) costs ${formatCheddar(
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
            howToPlay="Ranch: hatch a Cheddar Egg to add a creature to your roster (rarity is randomized - better tiers roll higher stats), feed it to train a stat (no ceiling), collect its item every 24 hours, or release it for a flat cheddar payout. Race: pick a creature and a category (each weights stats differently) to enter it for a shot at a cheddar payout - win or lose earns XP toward its level. Inventory: sell collected items for cheddar, or use one (no effect yet). Shop: buy Feed items - one kind per stat - which Feed consumes to train a creature."
            oddsSections={oddsSections}
        >
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3 }} variant="fullWidth">
                <Tab value="ranch" label="Ranch" icon={<PetsIcon />} iconPosition="start" />
                <Tab value="race" label="Race" icon={<SportsScoreIcon />} iconPosition="start" />
                <Tab value="inventory" label="Inventory" icon={<Inventory2Icon />} iconPosition="start" />
                <Tab value="shop" label="Shop" icon={<StorefrontIcon />} iconPosition="start" />
            </Tabs>

            {tab === "ranch" && <RanchTab />}
            {tab === "race" && <RaceTab />}
            {tab === "inventory" && <InventoryTab items={items} />}
            {tab === "shop" && <ShopTab />}
        </GameWrapper>
    );
}
