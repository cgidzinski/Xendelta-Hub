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
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ShieldIcon from "@mui/icons-material/Shield";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SellIcon from "@mui/icons-material/Sell";
import BarChartIcon from "@mui/icons-material/BarChart";
import GrassIcon from "@mui/icons-material/Grass";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
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
    const {
        feed,
        isFeeding,
        release,
        isReleasing,
        collect,
        isCollecting,
        feedItems,
        buyFeed,
        isBuyingFeed,
        shopItems,
        speciesByTier,
        useItem,
        isUsingItem,
        buyShopItem,
        isBuyingShopItem,
    } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [confirmingRelease, setConfirmingRelease] = useState(false);
    const [swappingSpecies, setSwappingSpecies] = useState(false);
    const [pickedSpecies, setPickedSpecies] = useState("");
    const [tab, setTab] = useState(0);
    const [shopOpen, setShopOpen] = useState(false);

    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const onCooldown = cooldownRemaining > 0;
    const feedProgress = onCooldown ? Math.max(0, 100 - (cooldownRemaining / feedCooldownMs) * 100) : 100;
    const canCollect = creature.canCollect && !creature.collectBlocked;
    const sellValue = releaseSellValue[creature.rarityTier] ?? 0;
    const feedItem = feedItems.find((f: RanchFeedItem) => f.type === creature.type);
    const units = feedUnitsRequired(creature.level);
    const owned = feedItem?.quantity ?? 0;

    const tonicItems = shopItems.filter((i) => i.key.startsWith("tonic-"));
    const serumItem = shopItems.find((i) => i.key === TYPE_SWAP_SERUM_KEY);
    const shieldItem = shopItems.find((i) => i.key === DECAY_SHIELD_KEY);
    const serumOwned = serumItem?.quantity ?? 0;
    const shieldOwned = shieldItem?.quantity ?? 0;
    const speciesOptions = (speciesByTier[creature.rarityTier] ?? []).filter((s) => s !== creature.species);
    const shieldActive = creature.decayShieldUntil && new Date(creature.decayShieldUntil).getTime() > Date.now();

    const handleUseTonic = (item: RanchShopItem) =>
        useItem({ itemKey: item.key, creatureId: creature.id })
            .then((r) => enqueueSnackbar(r.message, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to use tonic", { variant: "error" }));

    const handleBuyItem = (item: RanchShopItem) =>
        buyShopItem(item.key)
            .then(() => enqueueSnackbar(`Bought 1x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    const handleBuyFeed = () => {
        if (!feedItem) {
            return;
        }
        buyFeed({ type: creature.type, quantity: 1 })
            .then(() => enqueueSnackbar(`Bought 1x ${feedItem.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    };

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
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, py: 0.5 }}>
                <Avatar sx={{ width: 64, height: 64, fontSize: 34, bgcolor: "action.hover" }}>
                    {SPECIES_EMOJI[creature.rarityTier] ?? "🐾"}
                </Avatar>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, textAlign: "center" }}>
                    {creature.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: -0.5 }}>
                    {creature.species} &bull; Lv {creature.level}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                    <Chip size="small" label={creature.rarityTier} sx={{ textTransform: "capitalize", fontWeight: 700, bgcolor: TIER_COLOR[creature.rarityTier], color: "#000" }} />
                    <Chip size="small" label={`${TYPE_EMOJI[creature.type]} ${TYPE_LABEL[creature.type]}`} variant="outlined" />
                </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1, mb: 1.5 }}>
                <ToggleButtonGroup exclusive size="small" value={tab} onChange={(_, v) => v !== null && setTab(v)} fullWidth
                    sx={{ flex: 1, "& .MuiToggleButtonGroup-grouped": { py: 0.75, fontWeight: 700, textTransform: "none", border: "1px solid", borderColor: "divider", "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", borderColor: "primary.main" } } }}>
                    <ToggleButton value={0}><BarChartIcon fontSize="small" /></ToggleButton>
                    <ToggleButton value={1}><Inventory2Icon fontSize="small" /></ToggleButton>
                    <ToggleButton value={2}><MoreHorizIcon fontSize="small" /></ToggleButton>
                </ToggleButtonGroup>
                <Button variant="outlined" size="small" onClick={() => setShopOpen(true)} sx={{ textTransform: "none", flexShrink: 0 }}>
                    Shop
                </Button>
            </Box>

            <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2, bgcolor: "background.default" }}>
                {tab === 0 && (
                    <>
                        <StatsGrid stats={creature.stats} />
                        <ActionButton icon={<GrassIcon />}
                            label={canCollect ? `Collect ${creature.collectQuantity}x ${creature.itemLabel}` : `${creature.itemLabel} - collecting`}
                            description={creature.collectBlocked ? `${creature.name} is too sad to work - race it to keep collecting` : canCollect ? "(once per day)" : "Already collected today"}
                            color="success" disabled={isCollecting || !canCollect} onClick={handleCollect} />
                        <LinearProgress
                            variant="determinate"
                            value={feedProgress}
                            color={onCooldown ? "warning" : "info"}
                            sx={{ height: 6, borderRadius: 999 }}
                        />
                        <ActionButton icon={<RestaurantIcon />}
                            label={onCooldown ? "Feeding on cooldown" : `Feed (${units}x ${feedItem?.label ?? TYPE_LABEL[creature.type] + " Feed"})`}
                            description={onCooldown ? `Available in ${formatCountdown(cooldownRemaining)}` : `(${owned} owned)`}
                            disabled={isFeeding || onCooldown || owned < units} onClick={handleFeed} />
                    </>
                )}
                {tab === 1 && (
                    <>
                        <Typography variant="caption" color="text.secondary">Tonics — guaranteed, targeted stat boosts</Typography>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                            {STAT_ORDER.map((statKey) => {
                                const item = tonicItems.find((i) => i.key === `tonic-${statKey}`);
                                if (!item) return null;
                                return (
                                    <Button key={item.key} size="small" variant="outlined" disabled={isUsingItem || item.quantity <= 0} onClick={() => handleUseTonic(item)}
                                        sx={{ display: "flex", flexDirection: "column", gap: 0.25, flex: 1, minWidth: 56, py: 0.75, textTransform: "none" }}>
                                        {STAT_ICON[statKey]}
                                        <Typography variant="caption" sx={{ fontWeight: 700 }}>x{item.quantity}</Typography>
                                    </Button>
                                );
                            })}
                        </Box>
                        {!swappingSpecies ? (
                            <ActionButton icon={<AutorenewIcon />} label={`Type-Swap Serum (${serumOwned} owned)`}
                                description="Rerolls this creature's species within its own rarity tier"
                                disabled={isUsingItem || serumOwned <= 0 || speciesOptions.length === 0} onClick={() => setSwappingSpecies(true)} />
                        ) : (
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                                <FormControl size="small" fullWidth>
                                    <Select value={pickedSpecies} displayEmpty onChange={(e) => setPickedSpecies(e.target.value)}>
                                        <MenuItem value="" disabled>Choose a new species</MenuItem>
                                        {speciesOptions.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
                                    </Select>
                                </FormControl>
                                <Box sx={{ display: "flex", gap: 1 }}>
                                    <Button variant="outlined" fullWidth onClick={() => { setSwappingSpecies(false); setPickedSpecies(""); }}>Cancel</Button>
                                    <Button variant="contained" fullWidth disabled={!pickedSpecies || isUsingItem} onClick={handleTypeSwap}>Confirm Swap</Button>
                                </Box>
                            </Box>
                        )}
                        <ActionButton icon={<ShieldIcon />} label={shieldActive ? "Decay Shield active" : `Decay Shield (${shieldOwned} owned)`}
                            description={shieldActive ? `Protected until ${new Date(creature.decayShieldUntil!).toLocaleString()}` : "Protects from neglect decay for 3 days"}
                            disabled={isUsingItem || shieldOwned <= 0 || !!shieldActive} onClick={handleDecayShield} />
                    </>
                )}
                {tab === 2 && (
                    <>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, py: 2 }}>
                            <Box sx={{ textAlign: "center" }}>
                                <Typography variant="h5" sx={{ fontWeight: 700, color: "success.main" }}>{creature.raceWins}</Typography>
                                <Typography variant="caption" color="text.secondary">Wins</Typography>
                            </Box>
                            <Box sx={{ textAlign: "center" }}>
                                <Typography variant="h5" sx={{ fontWeight: 700, color: "error.main" }}>{creature.raceLosses}</Typography>
                                <Typography variant="caption" color="text.secondary">Losses</Typography>
                            </Box>
                        </Box>
                        <Box sx={{ mt: "auto" }}>
                            {!confirmingRelease ? (
                                <ActionButton icon={<SellIcon />} label={`Release for ${formatCheddar(sellValue)}`}
                                    description="" color="error" disabled={isReleasing} onClick={() => setConfirmingRelease(true)} />
                            ) : (
                                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "error.main", borderRadius: 1 }}>
                                    <Typography variant="body2" color="text.secondary">Release {creature.name} for {formatCheddar(sellValue)}?</Typography>
                                    <Box sx={{ display: "flex", gap: 1 }}>
                                        <Button variant="outlined" fullWidth disabled={isReleasing} onClick={() => setConfirmingRelease(false)}>Cancel</Button>
                                        <Button variant="contained" color="error" fullWidth disabled={isReleasing} onClick={handleRelease}>Confirm</Button>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    </>
                )}
            </Box>

            <Dialog open={shopOpen} onClose={() => setShopOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Ranch Shop
                    <IconButton onClick={() => setShopOpen(false)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                        Buy one at a time here. Bulk discounts (5x/10x) for Feed are in the Store.
                    </Typography>
                    {feedItem && (
                        <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Box sx={{ color: "primary.main" }}><RestaurantIcon /></Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{feedItem.label} (x{owned})</Typography>
                                        <Typography variant="caption" color="text.secondary">{formatCheddar(feedItem.price)} each</Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">Feeds {TYPE_LABEL[creature.type]} creatures</Typography>
                                </Box>
                            </Box>
                            <Button size="small" variant="contained" fullWidth disabled={isBuyingFeed} onClick={handleBuyFeed} sx={{ textTransform: "none" }}>
                                Buy 1 ({formatCheddar(feedItem.price)})
                            </Button>
                        </Box>
                    )}
                    {serumItem && (
                        <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Box sx={{ color: "primary.main" }}><AutorenewIcon /></Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{serumItem.label} (x{serumOwned})</Typography>
                                        <Typography variant="caption" color="text.secondary">{formatCheddar(serumItem.price)} each</Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">{serumItem.description}</Typography>
                                </Box>
                            </Box>
                            <Button size="small" variant="contained" fullWidth disabled={isBuyingShopItem} onClick={() => handleBuyItem(serumItem)} sx={{ textTransform: "none" }}>
                                Buy 1 ({formatCheddar(serumItem.price)})
                            </Button>
                        </Box>
                    )}
                    {shieldItem && (
                        <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Box sx={{ color: "primary.main" }}><ShieldIcon /></Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{shieldItem.label} (x{shieldOwned})</Typography>
                                        <Typography variant="caption" color="text.secondary">{formatCheddar(shieldItem.price)} each</Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">{shieldItem.description}</Typography>
                                </Box>
                            </Box>
                            <Button size="small" variant="contained" fullWidth disabled={isBuyingShopItem} onClick={() => handleBuyItem(shieldItem)} sx={{ textTransform: "none" }}>
                                Buy 1 ({formatCheddar(shieldItem.price)})
                            </Button>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
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
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, mt: 2 }}>
                    {creatures.map((creature) => (
                        <RanchCard key={creature.id} creature={creature} feedCooldownMs={feedCooldownMs} onClick={setSelectedId} />
                    ))}
                    <HatchTile hatchPrice={hatchPrice} onClick={() => setHatchDialogOpen(true)} />
                </Box>
            )}

            <Dialog
                open={!!selectedCreature}
                onClose={() => setSelectedId(null)}
                fullWidth
                PaperProps={{ sx: { borderRadius: 3, height: "90vh", maxWidth: 480 } }}
            >
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Creature Details
                    <IconButton onClick={() => setSelectedId(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3, overflow: "hidden", display: "flex", flexDirection: "column", px: 2 }}>
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
