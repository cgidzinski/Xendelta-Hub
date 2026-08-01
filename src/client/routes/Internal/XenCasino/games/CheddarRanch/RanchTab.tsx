import { useState } from "react";
import {
    Avatar,
    Box,
    Button,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    FormControl,
    IconButton,
    LinearProgress,
    MenuItem,
    Select,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ShieldIcon from "@mui/icons-material/Shield";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SellIcon from "@mui/icons-material/Sell";
import GrassIcon from "@mui/icons-material/Grass";
import { useSnackbar } from "notistack";
import { formatCheddar } from "../../utils/currency";
import {
    RanchCreature,
    RanchFeedItem,
    RanchShopItem,
    useCasinoRanch,
} from "../../../../../hooks/casino/useCasinoRanch";
import {
    ActionButton,
    DECAY_SHIELD_KEY,
    feedReadyAt,
    feedUnitsRequired,
    formatCountdown,
    HatchTile,
    RanchCard,
    RaceRecord,
    SPECIES_EMOJI,
    STAT_ICON,
    STAT_ORDER,
    StatsGrid,
    TIER_COLOR,
    TYPE_EMOJI,
    TYPE_LABEL,
    TYPE_SWAP_SERUM_KEY,
    useCountdown,
} from "./shared";

function HatchConfirm({ onDone }: { onDone: () => void }) {
    const { hatchPrice, hatch, isHatching } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleHatch = () =>
        hatch()
            .then((r) => {
                enqueueSnackbar(`Hatched a ${r.creature.rarityTier} ${r.creature.name}!`, { variant: "success" });
                onDone();
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to hatch", { variant: "error" }));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 1 }}>
            <Typography sx={{ fontSize: 48 }}>🥚</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                Hatch a Cheddar Egg for {formatCheddar(hatchPrice)}? Rarity, species, and type are randomized.
            </Typography>
            <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
                <Button variant="outlined" fullWidth onClick={onDone} disabled={isHatching}>
                    Cancel
                </Button>
                <Button variant="contained" fullWidth onClick={handleHatch} disabled={isHatching}>
                    Hatch ({formatCheddar(hatchPrice)})
                </Button>
            </Box>
        </Box>
    );
}

interface CreatureDetailsProps {
    creature: RanchCreature;
    feedCooldownMs: number;
    releaseSellValue: Record<string, number>;
    onReleased: () => void;
}

// Ranch-tab dialog - feed/collect/release only. Racing lives entirely on the Race tab now.
function CreatureDetails({ creature, feedCooldownMs, releaseSellValue, onReleased }: CreatureDetailsProps) {
    const { feed, isFeeding, release, isReleasing, collect, isCollecting, feedItems, shopItems, speciesByTier, useItem, isUsingItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [confirmingRelease, setConfirmingRelease] = useState(false);
    const [swappingSpecies, setSwappingSpecies] = useState(false);
    const [pickedSpecies, setPickedSpecies] = useState("");

    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const onCooldown = cooldownRemaining > 0;
    const canCollect = creature.canCollect && !creature.collectBlocked;
    const sellValue = releaseSellValue[creature.rarityTier] ?? 0;
    const feedItem = feedItems.find((f: RanchFeedItem) => f.type === creature.type);
    const units = feedUnitsRequired(creature.level);
    const owned = feedItem?.quantity ?? 0;

    const tonicItems = shopItems.filter((i) => i.key.startsWith("tonic-"));
    const serumOwned = shopItems.find((i) => i.key === TYPE_SWAP_SERUM_KEY)?.quantity ?? 0;
    const shieldOwned = shopItems.find((i) => i.key === DECAY_SHIELD_KEY)?.quantity ?? 0;
    const speciesOptions = (speciesByTier[creature.rarityTier] ?? []).filter((s) => s !== creature.species);
    const shieldActive = creature.decayShieldUntil && new Date(creature.decayShieldUntil).getTime() > Date.now();

    const handleUseTonic = (item: RanchShopItem) =>
        useItem({ itemKey: item.key, creatureId: creature.id })
            .then((r) => enqueueSnackbar(r.message, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to use tonic", { variant: "error" }));

    const handleTypeSwap = () => {
        if (!pickedSpecies) {
            return;
        }
        useItem({ itemKey: TYPE_SWAP_SERUM_KEY, creatureId: creature.id, species: pickedSpecies })
            .then((r) => {
                enqueueSnackbar(r.message, { variant: "success" });
                setSwappingSpecies(false);
                setPickedSpecies("");
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to swap species", { variant: "error" }));
    };

    const handleDecayShield = () =>
        useItem({ itemKey: DECAY_SHIELD_KEY, creatureId: creature.id })
            .then((r) => enqueueSnackbar(r.message, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to use Decay Shield", { variant: "error" }));

    const handleFeed = () =>
        feed(creature.id)
            .then((r) =>
                enqueueSnackbar(
                    `${creature.name} gained +${r.gains.speed} speed, +${r.gains.stamina} stamina, +${r.gains.power} power, +${r.gains.intelligence} intelligence, +${r.gains.luck} luck, +${r.gains.charm} charm!`,
                    { variant: "success" }
                )
            )
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
                <Typography variant="subtitle1" sx={{ fontWeight: 700, textAlign: "center" }}>
                    {creature.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: -0.5 }}>
                    {creature.species}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                    <Chip
                        size="small"
                        label={creature.rarityTier}
                        sx={{ textTransform: "capitalize", fontWeight: 700, bgcolor: TIER_COLOR[creature.rarityTier], color: "#000" }}
                    />
                    <Chip size="small" label={`${TYPE_EMOJI[creature.type]} ${TYPE_LABEL[creature.type]}`} variant="outlined" />
                    <Chip size="small" label={`Level ${creature.level}`} variant="outlined" />
                </Box>
            </Box>

            <StatsGrid stats={creature.stats} />

            <RaceRecord wins={creature.raceWins} losses={creature.raceLosses} />

            <ActionButton
                icon={<GrassIcon />}
                label={canCollect ? `Collect ${creature.collectQuantity}x ${creature.itemLabel}` : `${creature.itemLabel} - collecting`}
                description={
                    creature.collectBlocked
                        ? `${creature.name} is too sad to work - race it to keep collecting`
                        : canCollect
                            ? "Free - ready to collect (once per day)"
                            : "Already collected today — resets at midnight"
                }
                color="success"
                disabled={isCollecting || !canCollect}
                onClick={handleCollect}
            />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">
                    Tonics - guaranteed, targeted stat boosts
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {STAT_ORDER.map((statKey) => {
                        const item = tonicItems.find((i) => i.key === `tonic-${statKey}`);
                        if (!item) {
                            return null;
                        }
                        return (
                            <Button
                                key={item.key}
                                size="small"
                                variant="outlined"
                                disabled={isUsingItem || item.quantity <= 0}
                                onClick={() => handleUseTonic(item)}
                                sx={{ display: "flex", flexDirection: "column", gap: 0.25, minWidth: 56, py: 0.75, textTransform: "none" }}
                            >
                                {STAT_ICON[statKey]}
                                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                    x{item.quantity}
                                </Typography>
                            </Button>
                        );
                    })}
                </Box>
            </Box>

            {!swappingSpecies ? (
                <ActionButton
                    icon={<AutorenewIcon />}
                    label={`Type-Swap Serum (${serumOwned} owned)`}
                    description={serumOwned > 0 ? "Rerolls this creature's species within its own rarity tier" : "Buy in the Shop first"}
                    disabled={isUsingItem || serumOwned <= 0 || speciesOptions.length === 0}
                    onClick={() => setSwappingSpecies(true)}
                />
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                    <FormControl size="small" fullWidth>
                        <Select value={pickedSpecies} displayEmpty onChange={(e) => setPickedSpecies(e.target.value)}>
                            <MenuItem value="" disabled>
                                Choose a new species
                            </MenuItem>
                            {speciesOptions.map((s) => (
                                <MenuItem key={s} value={s}>
                                    {s}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => {
                                setSwappingSpecies(false);
                                setPickedSpecies("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button variant="contained" fullWidth disabled={!pickedSpecies || isUsingItem} onClick={handleTypeSwap}>
                            Confirm Swap
                        </Button>
                    </Box>
                </Box>
            )}

            <ActionButton
                icon={<ShieldIcon />}
                label={shieldActive ? "Decay Shield active" : `Decay Shield (${shieldOwned} owned)`}
                description={
                    shieldActive
                        ? `Protected from decay until ${new Date(creature.decayShieldUntil!).toLocaleString()}`
                        : shieldOwned > 0
                            ? "Protects from neglect decay for 3 days"
                            : "Buy in the Shop first"
                }
                disabled={isUsingItem || shieldOwned <= 0 || !!shieldActive}
                onClick={handleDecayShield}
            />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <ActionButton
                    icon={<RestaurantIcon />}
                    label={onCooldown ? "Feeding on cooldown" : `Feed (uses ${units}x ${feedItem?.label ?? TYPE_LABEL[creature.type] + " Feed"}, ${owned} owned)`}
                    description={
                        onCooldown
                            ? `Available again in ${formatCountdown(cooldownRemaining)}`
                            : owned >= units
                                ? "Raises every stat by a random amount, no ceiling"
                                : `Buy ${TYPE_LABEL[creature.type]} Feed in the Shop first`
                    }
                    disabled={isFeeding || onCooldown || owned < units}
                    onClick={handleFeed}
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

export default function RanchTab() {
    const { creatures, hatchPrice, feedCooldownMs, releaseSellValue, isLoading } = useCasinoRanch();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hatchDialogOpen, setHatchDialogOpen] = useState(false);

    const selectedCreature = creatures.find((c) => c.id === selectedId) ?? null;

    return (
        <Box>
            {isLoading ? (
                <LinearProgress sx={{ mt: 2 }} />
            ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 2, mt: 2 }}>
                    {creatures.map((creature) => (
                        <RanchCard key={creature.id} creature={creature} feedCooldownMs={feedCooldownMs} onClick={setSelectedId} />
                    ))}
                    <HatchTile hatchPrice={hatchPrice} onClick={() => setHatchDialogOpen(true)} />
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
                            onReleased={() => setSelectedId(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={hatchDialogOpen} onClose={() => setHatchDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Hatch a Creature
                    <IconButton onClick={() => setHatchDialogOpen(false)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3 }}>
                    <HatchConfirm onDone={() => setHatchDialogOpen(false)} />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
