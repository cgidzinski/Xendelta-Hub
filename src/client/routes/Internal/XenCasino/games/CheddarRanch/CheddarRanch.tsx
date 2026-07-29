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
import PsychologyIcon from "@mui/icons-material/Psychology";
import CasinoIcon from "@mui/icons-material/Casino";
import FavoriteIcon from "@mui/icons-material/Favorite";
import GrassIcon from "@mui/icons-material/Grass";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import {
    BetRaceResult,
    PendingRace,
    RanchCreature,
    RanchFeedItem,
    RanchItem,
    RanchOdds,
    RanchRacer,
    RanchType,
    useCasinoRanch,
} from "../../../../../hooks/casino/useCasinoRanch";

// Mirrors feedUnitsRequired in casinoRanch.ts - display-only (the server is the real
// authority on what a feed action actually consumes), so the Feed button can show the cost
// before the player taps it.
function feedUnitsRequired(level: number): number {
    return Math.floor((level - 1) / 10) + 1;
}

function displayName(c: { name: string; nickname: string }): string {
    return `${c.name} "${c.nickname}"`;
}

const TYPE_EMOJI: Record<RanchType, string> = { land: "🌾", sea: "🌊", air: "🪽" };
const TYPE_LABEL: Record<RanchType, string> = { land: "Land", sea: "Sea", air: "Air" };

const ITEM_EMOJI: Record<string, string> = {
    "down-feather": "🪶",
    "puppy-fluff": "🐕",
    "whisker-tuft": "🐭",
    "goat-milk": "🥛",
    "otter-pelt": "🦦",
    "fox-tail": "🦊",
    "storm-hide": "⚡",
    "moon-fang": "🌙",
    "badger-claw": "🦡",
    "gilded-horn": "🐏",
    "falcon-plume": "🪽",
    "ember-fur": "🔥",
    "wyrm-scale": "🐲",
    "solar-antler": "☀️",
    "void-ink": "🌌",
};

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

function totalStats(stats: RanchCreature["stats"]): number {
    return stats.speed + stats.stamina + stats.power + stats.intelligence + stats.luck + stats.charm;
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

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1, textAlign: "center" }}>
            <Box sx={{ display: "flex", justifyContent: "center", color: "text.secondary", "& svg": { fontSize: 16 } }}>{icon}</Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {value}
            </Typography>
        </Box>
    );
}

// Full 6-stat grid shared by the roster dialog and the race field - keeps every stat
// display in the game consistent (same order, same icons).
function StatsGrid({ stats }: { stats: RanchCreature["stats"] }) {
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 1 }}>
            <StatTile icon={<SpeedIcon />} label="Speed" value={stats.speed} />
            <StatTile icon={<BatteryChargingFullIcon />} label="Stamina" value={stats.stamina} />
            <StatTile icon={<BoltIcon />} label="Power" value={stats.power} />
            <StatTile icon={<PsychologyIcon />} label="Intelligence" value={stats.intelligence} />
            <StatTile icon={<CasinoIcon />} label="Luck" value={stats.luck} />
            <StatTile icon={<FavoriteIcon />} label="Charm" value={stats.charm} />
        </Box>
    );
}

// Replaces a pair of loud colored win/loss pills with one calm bordered box, matching
// StatTile's visual language - a compact record + thin two-color bar instead of two
// competing chips.
function RaceRecord({ wins, losses }: { wins: number; losses: number }) {
    const total = wins + losses;
    const winPct = total > 0 ? (wins / total) * 100 : 0;
    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.25 }}>
            <Typography variant="caption" color="text.secondary">
                Race Record
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {wins}W – {losses}L{total > 0 ? ` (${Math.round(winPct)}%)` : ""}
            </Typography>
            {total > 0 && (
                <Box sx={{ display: "flex", height: 4, borderRadius: 999, overflow: "hidden", mt: 0.5 }}>
                    <Box sx={{ width: `${winPct}%`, bgcolor: "success.main" }} />
                    <Box sx={{ flex: 1, bgcolor: "action.hover" }} />
                </Box>
            )}
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
            <Typography variant="body2" sx={{ fontWeight: 700, textAlign: "center" }}>
                {creature.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", textAlign: "center", mt: -0.5 }}>
                "{creature.nickname}"
            </Typography>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
                <Chip
                    size="small"
                    label={creature.rarityTier}
                    sx={{ textTransform: "capitalize", fontWeight: 700, bgcolor: TIER_COLOR[creature.rarityTier], color: "#000" }}
                />
                <Chip size="small" label={`${TYPE_EMOJI[creature.type]} ${TYPE_LABEL[creature.type]}`} variant="outlined" />
                <Chip size="small" label={`Lv ${creature.level}`} variant="outlined" />
            </Box>
            <Typography variant="caption" color="text.secondary">
                Total stats: {totalStats(creature.stats)}
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

// The Ranch tab's roster grid ends with this dashed "+" tile instead of a standalone Hatch
// button above the grid - same empty-plot pattern Garden uses for its own grid.
function HatchTile({ hatchPrice, onClick }: { hatchPrice: number; onClick: () => void }) {
    return (
        <CardActionArea
            onClick={onClick}
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                p: 2,
                minHeight: 150,
                borderRadius: 2,
                border: "1px dashed",
                borderColor: "divider",
            }}
        >
            <Typography sx={{ fontSize: 40, lineHeight: 1, color: "text.disabled" }}>➕</Typography>
            <Typography variant="body2" color="text.secondary">
                Hatch Egg
            </Typography>
            <Typography variant="caption" color="text.secondary">
                {formatCheddar(hatchPrice)}
            </Typography>
        </CardActionArea>
    );
}

function HatchConfirm({ onDone }: { onDone: () => void }) {
    const { hatchPrice, hatch, isHatching } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleHatch = () =>
        hatch()
            .then((r) => {
                enqueueSnackbar(`Hatched a ${r.creature.rarityTier} ${displayName(r.creature)}!`, { variant: "success" });
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
    const feedItem = feedItems.find((f: RanchFeedItem) => f.type === creature.type);
    const units = feedUnitsRequired(creature.level);
    const owned = feedItem?.quantity ?? 0;

    const handleFeed = () =>
        feed(creature.id)
            .then((r) =>
                enqueueSnackbar(
                    `${displayName(creature)} gained +${r.gains.speed} speed, +${r.gains.stamina} stamina, +${r.gains.power} power, +${r.gains.intelligence} intelligence, +${r.gains.luck} luck, +${r.gains.charm} charm!`,
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
                enqueueSnackbar(`Released ${displayName(creature)} for ${formatCheddar(r.sellValue)} cheddar.`, { variant: "success" });
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
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                    "{creature.nickname}"
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
                label={canCollect ? `Collect ${creature.level}x ${creature.itemLabel}` : `${creature.itemLabel} - collecting`}
                description={canCollect ? "Free - ready to collect" : `Ready again in ${formatCountdown(collectCooldownRemaining)}`}
                color="success"
                disabled={isCollecting || !canCollect}
                onClick={handleCollect}
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
                            Release {displayName(creature)} for {formatCheddar(sellValue)}? This can't be undone.
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
    const { creatures, hatchPrice, feedCooldownMs, releaseSellValue, collectCooldownMs, isLoading } = useCasinoRanch();
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
                            collectCooldownMs={collectCooldownMs}
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

// How long (seconds) the leader's lane takes to finish, plus a stagger per place further
// back - a purely cosmetic mapping from the server-decided finishing order (RaceResultEntry
// .place) onto a CSS transition duration, so lanes visibly cross the line in the exact
// order the server already computed.
const BASE_RACE_DURATION_S = 1.8;
const RACE_STAGGER_S = 0.45;
function durationForPlace(place: number): number {
    return BASE_RACE_DURATION_S + (place - 1) * RACE_STAGGER_S;
}

interface RaceAnimationProps {
    racers: RanchRacer[];
    result: BetRaceResult;
    onFinished: () => void;
}

// Plays out a result the server has already fully decided (result.order) - four CSS
// width-transition "lanes", one per racer, each animating 0% -> 100% over a duration
// derived from its place, so they finish in the server's order. No randomness, no new
// component library - plain Box/Typography, matching Mine/Garden's aesthetic.
function RaceAnimation({ racers, result, onFinished }: RaceAnimationProps) {
    const [started, setStarted] = useState(false);

    useEffect(() => {
        const startId = setTimeout(() => setStarted(true), 50);
        return () => clearTimeout(startId);
    }, []);

    useEffect(() => {
        const maxDuration = Math.max(...result.order.map((o) => durationForPlace(o.place)));
        const finishId = setTimeout(onFinished, maxDuration * 1000 + 400);
        return () => clearTimeout(finishId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const placeByRacerId = Object.fromEntries(result.order.map((o) => [o.racerId, o.place]));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, my: 2 }}>
            {racers.map((racer) => {
                const place = placeByRacerId[racer.id] ?? racers.length;
                const isBet = racer.id === result.betRacerId;
                return (
                    <Box key={racer.id}>
                        <Typography variant="caption" sx={{ fontWeight: isBet ? 700 : 400 }}>
                            {racer.name}
                            {racer.isPlayer ? " (You)" : ""}
                            {isBet ? " - your bet" : ""}
                        </Typography>
                        <Box sx={{ position: "relative", height: 10, bgcolor: "action.hover", borderRadius: 999, overflow: "hidden" }}>
                            <Box
                                sx={{
                                    height: "100%",
                                    width: started ? "100%" : "0%",
                                    transition: `width ${durationForPlace(place)}s linear`,
                                    bgcolor: isBet ? "warning.main" : "primary.main",
                                    borderRadius: 999,
                                }}
                            />
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}

function RacerRow({ racer, odds }: { racer: RanchRacer; odds?: RanchOdds }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, width: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 28 }}>{TYPE_EMOJI[racer.type]}</Typography>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {racer.name} "{racer.nickname}"
                        {racer.isPlayer ? " (You)" : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Lv {racer.level} - Spd {racer.stats.speed} / Sta {racer.stats.stamina} / Pwr {racer.stats.power} / Int{" "}
                        {racer.stats.intelligence} / Lck {racer.stats.luck} / Chr {racer.stats.charm}
                    </Typography>
                </Box>
            </Box>
            {odds && (
                <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Chip size="small" color="warning" label={`x${odds.multiplier.toFixed(2)}`} sx={{ fontWeight: 700 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                        {(odds.winProbability * 100).toFixed(0)}% win
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

const STAKE_PRESETS = [100, 250, 500, 1000, 2500, 5000];
const SPIN_EMOJI = ["🐹", "🐐", "🦌", "🦅", "🐉", "🦦", "🦊", "🐺", "🐏"];

function RaceTab() {
    const {
        creatures,
        feedCooldownMs,
        minRaceStake,
        maxRaceStake,
        entryFee,
        pendingRace,
        startRace,
        isStartingRace,
        forfeitRace,
        isForfeitingRace,
        betRace,
        isBettingRace,
    } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [pendingOverride, setPendingOverride] = useState<PendingRace | null>(null);
    const [spinning, setSpinning] = useState(false);
    const [spinEmojis, setSpinEmojis] = useState<string[]>(["🐾", "🐾", "🐾", "🐾"]);
    const [betRacerId, setBetRacerId] = useState<string | null>(null);
    const [stake, setStake] = useState(minRaceStake || 100);
    const [raceResult, setRaceResult] = useState<BetRaceResult | null>(null);
    const [confirmingForfeit, setConfirmingForfeit] = useState(false);

    const selectedCreature = creatures.find((c) => c.id === selectedId) ?? null;
    // The just-started response is used directly (rather than waiting on the roster
    // refetch pendingRace triggers) so the reveal timing is exact, not racing a network
    // round-trip - pendingRace still takes over once set, e.g. on a page refresh.
    const pending: PendingRace | null = pendingOverride ?? (pendingRace && pendingRace.creatureId === selectedId ? pendingRace : null);

    // Resume an in-flight race attempt (e.g. after a page refresh) by auto-selecting its
    // creature, so the player isn't forced to re-find it manually.
    useEffect(() => {
        if (pendingRace && !selectedId) {
            setSelectedId(pendingRace.creatureId);
        }
    }, [pendingRace, selectedId]);

    const handleSelectCreature = (id: string) => {
        setSelectedId(id);
        setPendingOverride(null);
        setBetRacerId(null);
        setRaceResult(null);
        setConfirmingForfeit(false);
    };

    const handleStart = () => {
        if (!selectedCreature) {
            return;
        }
        setSpinning(true);
        const spinId = setInterval(() => {
            setSpinEmojis([0, 1, 2, 3].map(() => SPIN_EMOJI[Math.floor(Math.random() * SPIN_EMOJI.length)]));
        }, 120);

        startRace(selectedCreature.id)
            .then((r) => {
                setTimeout(() => {
                    clearInterval(spinId);
                    setSpinning(false);
                    setPendingOverride(r.pending);
                    setBetRacerId("player");
                }, 1400);
            })
            .catch((e) => {
                clearInterval(spinId);
                setSpinning(false);
                enqueueSnackbar(e.message || "Failed to start race", { variant: "error" });
            });
    };

    const handleBet = () => {
        if (!selectedCreature || !pending || !betRacerId) {
            return;
        }
        betRace({ creatureId: selectedCreature.id, racerId: betRacerId, stake })
            .then((r) => setRaceResult(r))
            .catch((e) => enqueueSnackbar(e.message || "Failed to place bet", { variant: "error" }));
    };

    const handleForfeit = () => {
        if (!selectedCreature) {
            return;
        }
        forfeitRace(selectedCreature.id)
            .then(() => {
                enqueueSnackbar("Forfeited - the entry fee was not refunded.", { variant: "info" });
                setPendingOverride(null);
                setBetRacerId(null);
                setConfirmingForfeit(false);
                setSelectedId(null);
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to forfeit", { variant: "error" }));
    };

    const handleAnimationFinished = () => {
        if (raceResult) {
            if (raceResult.won) {
                enqueueSnackbar(`Your bet won! +${formatCheddar(raceResult.payout)} cheddar (${raceResult.multiplier}x)`, { variant: "success" });
            } else {
                enqueueSnackbar(`Your bet lost - ${formatCheddar(raceResult.stake)} cheddar wagered.`, { variant: "error" });
            }
        }
        setRaceResult(null);
        setPendingOverride(null);
        setBetRacerId(null);
        setSelectedId(null);
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
            {!pending && !spinning && (
                <>
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
                                onClick={handleSelectCreature}
                            />
                        ))}
                    </Box>
                </>
            )}

            {selectedCreature && !pending && !spinning && (
                <Box sx={{ maxWidth: 480, mx: "auto" }}>
                    <ActionButton
                        icon={<SportsScoreIcon />}
                        label={`Race with ${selectedCreature.name} - Pay ${formatCheddar(entryFee)}`}
                        description="Randomizes the course and your 3 rivals. The fee is non-refundable once paid, even if you forfeit."
                        color="warning"
                        disabled={isStartingRace}
                        onClick={handleStart}
                    />
                </Box>
            )}

            {spinning && (
                <Box sx={{ maxWidth: 560, mx: "auto" }}>
                    <Typography variant="h6" sx={{ textAlign: "center", fontWeight: 700, mb: 2 }}>
                        🎡 Randomizing the course and your competition...
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {spinEmojis.map((emoji, i) => (
                            <Box
                                key={i}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    p: 1.5,
                                    borderRadius: 1.5,
                                    border: "1px dashed",
                                    borderColor: "divider",
                                    opacity: 0.7,
                                }}
                            >
                                <Typography sx={{ fontSize: 28 }}>{emoji}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    ???
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
            )}

            {pending && !raceResult && (
                <Box sx={{ maxWidth: 560, mx: "auto" }}>
                    <Typography variant="subtitle1" sx={{ textAlign: "center", fontWeight: 700, mb: 2 }}>
                        Course: {pending.course.label}
                    </Typography>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
                        {pending.racers.map((racer) => {
                            const odds = pending.odds.find((o) => o.racerId === racer.id);
                            return (
                                <CardActionArea
                                    key={racer.id}
                                    onClick={() => setBetRacerId(racer.id)}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 1.5,
                                        border: betRacerId === racer.id ? "2px solid" : "1px solid",
                                        borderColor: betRacerId === racer.id ? "primary.main" : "divider",
                                    }}
                                >
                                    <RacerRow racer={racer} odds={odds} />
                                </CardActionArea>
                            );
                        })}
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                        Stake
                    </Typography>
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={stake}
                        onChange={(_, value) => value && setStake(value)}
                        fullWidth
                        sx={{ mb: 1.5, mt: 0.5, flexWrap: "wrap" }}
                    >
                        {STAKE_PRESETS.filter((s) => s >= minRaceStake && s <= maxRaceStake).map((s) => (
                            <ToggleButton key={s} value={s} sx={{ textTransform: "none" }}>
                                {formatCheddar(s)}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>

                    <ActionButton
                        icon={<SportsScoreIcon />}
                        label={`Race (${formatCheddar(stake)} bet)`}
                        description={
                            betRacerId
                                ? `Betting on ${pending.racers.find((r) => r.id === betRacerId)?.name}${
                                      betRacerId === "player" ? " (your own creature)" : ""
                                  }`
                                : "Pick a racer above to bet on"
                        }
                        color="warning"
                        disabled={isBettingRace || !betRacerId}
                        onClick={handleBet}
                    />

                    {!confirmingForfeit ? (
                        <Button
                            variant="text"
                            color="error"
                            fullWidth
                            sx={{ mt: 1, textTransform: "none" }}
                            disabled={isForfeitingRace}
                            onClick={() => setConfirmingForfeit(true)}
                        >
                            Forfeit (lose {formatCheddar(entryFee)})
                        </Button>
                    ) : (
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1, p: 1.5, border: "1px solid", borderColor: "error.main", borderRadius: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                                Forfeit without betting? The {formatCheddar(entryFee)} entry fee is already gone either way.
                            </Typography>
                            <Box sx={{ display: "flex", gap: 1 }}>
                                <Button variant="outlined" fullWidth disabled={isForfeitingRace} onClick={() => setConfirmingForfeit(false)}>
                                    Cancel
                                </Button>
                                <Button variant="contained" color="error" fullWidth disabled={isForfeitingRace} onClick={handleForfeit}>
                                    Confirm Forfeit
                                </Button>
                            </Box>
                        </Box>
                    )}
                </Box>
            )}

            {pending && raceResult && (
                <Box sx={{ maxWidth: 560, mx: "auto" }}>
                    <Typography variant="subtitle1" sx={{ textAlign: "center", fontWeight: 700, mb: 1 }}>
                        And they're off!
                    </Typography>
                    <RaceAnimation racers={pending.racers} result={raceResult} onFinished={handleAnimationFinished} />
                </Box>
            )}
        </Box>
    );
}

function InventoryTab({ items }: { items: RanchItem[] }) {
    const { sellItem, isSellingItem, useItem, isUsingItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const selectedItem = items.find((i) => i.key === selectedKey) ?? null;

    const handleSell = () => {
        if (!selectedItem) {
            return;
        }
        sellItem(selectedItem.key)
            .then((r) => {
                enqueueSnackbar(`Sold ${r.quantity}x ${selectedItem.label} for ${formatCheddar(r.totalValue)} cheddar.`, { variant: "success" });
                setSelectedKey(null);
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to sell", { variant: "error" }));
    };

    const handleUse = () => {
        if (!selectedItem) {
            return;
        }
        useItem(selectedItem.key)
            .then((r) => {
                enqueueSnackbar(r.message, { variant: "info" });
                setSelectedKey(null);
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to use item", { variant: "error" }));
    };

    if (items.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 2 }}>
                No items yet - collect from a creature on the Ranch tab.
            </Typography>
        );
    }

    return (
        <>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                {items.map((item) => (
                    <CardActionArea
                        key={item.key}
                        onClick={() => setSelectedKey(item.key)}
                        sx={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 0.5,
                            p: 2,
                            borderRadius: 2,
                            border: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <Chip
                            size="small"
                            label={`x${item.quantity}`}
                            sx={{ position: "absolute", top: 6, right: 6, height: 20, fontSize: 11, fontWeight: 700 }}
                        />
                        <Typography sx={{ fontSize: 36 }}>{ITEM_EMOJI[item.key] ?? "📦"}</Typography>
                        <Typography variant="caption" sx={{ textAlign: "center", fontWeight: 600 }}>
                            {item.label}
                        </Typography>
                    </CardActionArea>
                ))}
            </Box>

            <Dialog open={!!selectedItem} onClose={() => setSelectedKey(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Item Details
                    <IconButton onClick={() => setSelectedKey(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                {selectedItem && (
                    <DialogContent sx={{ pb: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                        <Typography sx={{ fontSize: 48 }}>{ITEM_EMOJI[selectedItem.key] ?? "📦"}</Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {selectedItem.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                            {selectedItem.description}
                        </Typography>
                        <Typography variant="body2">
                            You own {selectedItem.quantity} - worth {formatCheddar(selectedItem.sellValue)} each
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1, width: "100%", mt: 1 }}>
                            <Button variant="outlined" fullWidth disabled={isUsingItem} onClick={handleUse}>
                                Use
                            </Button>
                            <Button variant="contained" fullWidth startIcon={<SellIcon />} disabled={isSellingItem} onClick={handleSell}>
                                Sell All ({formatCheddar(selectedItem.quantity * selectedItem.sellValue)})
                            </Button>
                        </Box>
                    </DialogContent>
                )}
            </Dialog>
        </>
    );
}

const FEED_BUY_QUANTITIES = [1, 5, 10];

function ShopTab() {
    const { feedItems, buyFeed, isBuyingFeed } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuy = (item: RanchFeedItem, quantity: number) =>
        buyFeed({ type: item.type, quantity })
            .then(() => enqueueSnackbar(`Bought ${quantity}x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    if (feedItems.length === 0) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {feedItems.map((item) => (
                <Box
                    key={item.key}
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        p: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1.5,
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ fontSize: 24 }}>{TYPE_EMOJI[item.type]}</Typography>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {item.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                You own {item.quantity} - feeds {TYPE_LABEL[item.type]} creatures
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                        {FEED_BUY_QUANTITIES.map((quantity) => (
                            <Button
                                key={quantity}
                                size="small"
                                variant="contained"
                                startIcon={<RestaurantIcon />}
                                disabled={isBuyingFeed}
                                onClick={() => handleBuy(item, quantity)}
                                sx={{ textTransform: "none" }}
                            >
                                {quantity}x ({formatCheddar(item.price * quantity)})
                            </Button>
                        ))}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

type TabKey = "ranch" | "race" | "inventory" | "shop";

export default function CheddarRanch() {
    const { items, rarityTiers, raceCourses, hatchPrice, minRaceStake, maxRaceStake, entryFee, isError, error, refetch } = useCasinoRanch();
    const [tab, setTab] = useState<TabKey>("ranch");

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
            footnote: `On the Race tab, paying the flat ${formatCheddar(
                entryFee
            )} entry fee (non-refundable once paid, even if you forfeit) randomizes both the course - which weights the 6 stats differently - and your 3 rivals, then reveals real bookmaker-style odds for all 4 racers. You can then bet ${formatCheddar(
                minRaceStake
            )}-${formatCheddar(
                maxRaceStake
            )} on any one of the 4 to win - a favorite pays a lower multiplier, a longshot pays a higher one - or forfeit and walk away (still losing the entry fee). Your own creature's win/loss record and level track whether it actually placed first, independent of who you bet on.`,
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
            howToPlay="Ranch: tap the + tile to hatch a Cheddar Egg (rarity, species, and Land/Sea/Air type are randomized). Feed a creature with the Feed matching its own type to raise every stat by a random amount - higher-level creatures need more Feed per feeding, and a creature left unfed too long slowly loses stats. Collect its item every 24 hours, or release it for a flat cheddar payout. Race: pick a creature and pay the entry fee to randomize the course and reveal 3 rivals all at once, then bet on any of the 4 racers (including your own) and watch the race play out - or forfeit if you don't like your odds (the entry fee is gone either way). Your own creature's record and level track whether it actually placed first, regardless of who you bet on. Inventory: tap an item for details, then sell the stack for cheddar or use one (no effect yet). Shop: buy Land/Sea/Air Feed."
            oddsSections={oddsSections}
        >
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3 }} variant="fullWidth">
                <Tab value="ranch" icon={<PetsIcon />} aria-label="Ranch" />
                <Tab value="race" icon={<SportsScoreIcon />} aria-label="Race" />
                <Tab value="inventory" icon={<Inventory2Icon />} aria-label="Inventory" />
                <Tab value="shop" icon={<StorefrontIcon />} aria-label="Shop" />
            </Tabs>

            {tab === "ranch" && <RanchTab />}
            {tab === "race" && <RaceTab />}
            {tab === "inventory" && <InventoryTab items={items} />}
            {tab === "shop" && <ShopTab />}
        </GameWrapper>
    );
}
