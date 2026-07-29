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
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import GrassIcon from "@mui/icons-material/Grass";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { BetRaceResult, PendingRace, RanchCreature, RanchItem, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";

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
    return stats.speed + stats.stamina + stats.power + stats.intelligence + stats.luck;
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

// Full 5-stat grid shared by the roster dialog and the race field - keeps every stat
// display in the game consistent (same order, same icons).
function StatsGrid({ stats }: { stats: RanchCreature["stats"] }) {
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 1 }}>
            <StatTile icon={<SpeedIcon />} label="Speed" value={stats.speed} />
            <StatTile icon={<BatteryChargingFullIcon />} label="Stamina" value={stats.stamina} />
            <StatTile icon={<BoltIcon />} label="Power" value={stats.power} />
            <StatTile icon={<PsychologyIcon />} label="Intelligence" value={stats.intelligence} />
            <StatTile icon={<CasinoIcon />} label="Luck" value={stats.luck} />
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

interface CreatureDetailsProps {
    creature: RanchCreature;
    feedCooldownMs: number;
    releaseSellValue: Record<string, number>;
    collectCooldownMs: number;
    onReleased: () => void;
}

// Ranch-tab dialog - feed/collect/release only. Racing lives entirely on the Race tab now.
function CreatureDetails({ creature, feedCooldownMs, releaseSellValue, collectCooldownMs, onReleased }: CreatureDetailsProps) {
    const { feed, isFeeding, release, isReleasing, collect, isCollecting, feedItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [confirmingRelease, setConfirmingRelease] = useState(false);

    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const onCooldown = cooldownRemaining > 0;
    const collectCooldownRemaining = useCountdown(collectReadyAt(creature, collectCooldownMs));
    const canCollect = collectCooldownRemaining <= 0;
    const sellValue = releaseSellValue[creature.rarityTier] ?? 0;
    const xpIntoLevel = creature.xp % 100;
    const ownedFeed = feedItem?.quantity ?? 0;

    const handleFeed = () =>
        feed(creature.id)
            .then((r) =>
                enqueueSnackbar(
                    `${creature.name} gained +${r.gains.speed} speed, +${r.gains.stamina} stamina, +${r.gains.power} power, +${r.gains.intelligence} intelligence, +${r.gains.luck} luck!`,
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

            <StatsGrid stats={creature.stats} />

            <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
                <Chip size="small" color="success" label={`${creature.raceWins} 1st-place finishes`} />
                <Chip size="small" color="default" label={`${creature.raceLosses} Other finishes`} />
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
                <ActionButton
                    icon={<RestaurantIcon />}
                    label={onCooldown ? "Feeding on cooldown" : `Feed (${ownedFeed} owned)`}
                    description={
                        onCooldown
                            ? `Available again in ${formatCountdown(cooldownRemaining)}`
                            : ownedFeed > 0
                                ? "Uses one Feed item - raises every stat by a random amount, no ceiling"
                                : "Buy Feed in the Shop first"
                    }
                    disabled={isFeeding || onCooldown || ownedFeed <= 0}
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
    racers: PendingRace["racers"];
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

const STAKE_PRESETS = [100, 250, 500, 1000, 2500, 5000];

function RaceTab() {
    const {
        creatures,
        raceCourses,
        feedCooldownMs,
        minRaceStake,
        maxRaceStake,
        pendingRace,
        prepareRace,
        isPreparingRace,
        betRace,
        isBettingRace,
    } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [localPending, setLocalPending] = useState<PendingRace | null>(null);
    const [spinning, setSpinning] = useState(false);
    const [spinLabel, setSpinLabel] = useState<string | null>(null);
    const [betRacerId, setBetRacerId] = useState<string | null>(null);
    const [stake, setStake] = useState(minRaceStake || 100);
    const [raceResult, setRaceResult] = useState<BetRaceResult | null>(null);

    const selectedCreature = creatures.find((c) => c.id === selectedId) ?? null;

    // Resume an unexpired pending race for the selected creature (e.g. after a page
    // refresh) rather than forcing a wasted extra "scout" call.
    useEffect(() => {
        if (selectedId && pendingRace && pendingRace.creatureId === selectedId && !localPending) {
            setLocalPending(pendingRace);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, pendingRace]);

    const handleSelectCreature = (id: string) => {
        setSelectedId(id);
        setLocalPending(null);
        setBetRacerId(null);
        setRaceResult(null);
    };

    const handleScout = () => {
        if (!selectedCreature) {
            return;
        }
        setSpinning(true);
        setLocalPending(null);
        setBetRacerId(null);
        let i = 0;
        const spinId = setInterval(() => {
            setSpinLabel(raceCourses[i % Math.max(raceCourses.length, 1)]?.label ?? null);
            i++;
        }, 100);

        prepareRace(selectedCreature.id)
            .then((r) => {
                setTimeout(() => {
                    clearInterval(spinId);
                    setSpinning(false);
                    setSpinLabel(null);
                    setLocalPending(r.pending);
                    setBetRacerId("player");
                }, 1200);
            })
            .catch((e) => {
                clearInterval(spinId);
                setSpinning(false);
                setSpinLabel(null);
                enqueueSnackbar(e.message || "Failed to scout the track", { variant: "error" });
            });
    };

    const handleBet = () => {
        if (!selectedCreature || !localPending || !betRacerId) {
            return;
        }
        betRace({ creatureId: selectedCreature.id, racerId: betRacerId, stake })
            .then((r) => setRaceResult(r))
            .catch((e) => {
                enqueueSnackbar(e.message || "Failed to place bet", { variant: "error" });
                // The pending race may have expired between scouting and betting - clear it
                // so the player has to scout (and look at a fresh field/odds) again rather
                // than betting blind against numbers that no longer apply.
                setLocalPending(null);
                setBetRacerId(null);
            });
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
        setLocalPending(null);
        setBetRacerId(null);
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
                        onClick={handleSelectCreature}
                    />
                ))}
            </Box>

            {selectedCreature && !localPending && !spinning && (
                <Box sx={{ maxWidth: 480, mx: "auto" }}>
                    <ActionButton
                        icon={<SportsScoreIcon />}
                        label={`Scout the Track with ${selectedCreature.name}`}
                        description="Spins for a random course and reveals 3 rivals with odds - free, no money moves until you bet."
                        disabled={isPreparingRace}
                        onClick={handleScout}
                    />
                </Box>
            )}

            {spinning && (
                <Typography variant="h6" sx={{ textAlign: "center", fontWeight: 700, mt: 2 }}>
                    🎡 Spinning... {spinLabel}
                </Typography>
            )}

            {selectedCreature && localPending && !raceResult && (
                <Box sx={{ maxWidth: 560, mx: "auto" }}>
                    <Typography variant="subtitle1" sx={{ textAlign: "center", fontWeight: 700, mb: 2 }}>
                        Course: {localPending.course.label}
                    </Typography>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
                        {localPending.racers.map((racer) => {
                            const odds = localPending.odds.find((o) => o.racerId === racer.id);
                            return (
                                <CardActionArea
                                    key={racer.id}
                                    onClick={() => setBetRacerId(racer.id)}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 1,
                                        p: 1.5,
                                        borderRadius: 1.5,
                                        border: betRacerId === racer.id ? "2px solid" : "1px solid",
                                        borderColor: betRacerId === racer.id ? "primary.main" : "divider",
                                    }}
                                >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                        <Typography sx={{ fontSize: 28 }}>{SPECIES_EMOJI[selectedCreature.rarityTier] ?? "🐾"}</Typography>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                {racer.name}
                                                {racer.isPlayer ? " (You)" : ""}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                                Lv {racer.level} - Spd {racer.stats.speed} / Sta {racer.stats.stamina} / Pwr {racer.stats.power} / Int{" "}
                                                {racer.stats.intelligence} / Lck {racer.stats.luck}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                        <Chip size="small" color="warning" label={`x${odds?.multiplier.toFixed(2) ?? "?"}`} sx={{ fontWeight: 700 }} />
                                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                                            {odds ? (odds.winProbability * 100).toFixed(0) : "?"}% win
                                        </Typography>
                                    </Box>
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
                                ? `Betting on ${localPending.racers.find((r) => r.id === betRacerId)?.name}${
                                      betRacerId === "player" ? " (your own creature)" : ""
                                  }`
                                : "Pick a racer above to bet on"
                        }
                        color="warning"
                        disabled={isBettingRace || !betRacerId}
                        onClick={handleBet}
                    />
                </Box>
            )}

            {selectedCreature && localPending && raceResult && (
                <Box sx={{ maxWidth: 560, mx: "auto" }}>
                    <Typography variant="subtitle1" sx={{ textAlign: "center", fontWeight: 700, mb: 1 }}>
                        And they're off!
                    </Typography>
                    <RaceAnimation racers={localPending.racers} result={raceResult} onFinished={handleAnimationFinished} />
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
    const { feedItem, buyFeed, isBuyingFeed } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuy = () =>
        buyFeed()
            .then(() => enqueueSnackbar("Bought 1x Feed.", { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    if (!feedItem) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    return (
        <Box
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
                    {feedItem.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    You own {feedItem.quantity} - raises every stat by a random amount, no ceiling
                </Typography>
            </Box>
            <Button size="small" variant="contained" startIcon={<RestaurantIcon />} disabled={isBuyingFeed} onClick={handleBuy}>
                Buy ({formatCheddar(feedItem.price)})
            </Button>
        </Box>
    );
}

type TabKey = "ranch" | "race" | "inventory" | "shop";

export default function CheddarRanch() {
    const { items, rarityTiers, raceCourses, hatchPrice, minRaceStake, maxRaceStake, isError, error, refetch } = useCasinoRanch();
    const [tab, setTab] = useState<TabKey>("ranch");

    const oddsSections: OddsSection[] = [
        {
            title: "Rarity Tiers",
            rows: rarityTiers.map((t) => ({
                label: `${t.label} (${(t.probability * 100).toFixed(0)}% chance)`,
                payout: `Stats ${t.statRange[0]}-${t.statRange[1]}`,
            })),
            footnote: `Hatching a Cheddar Egg costs ${formatCheddar(hatchPrice)} and draws one of these five rarity tiers - a rarer tier means a higher starting roll across all 5 stats (Speed/Stamina/Power/Intelligence/Luck). There's no stat ceiling: feeding always raises every stat, for as long as you keep feeding.`,
        },
        {
            title: "Race Courses",
            rows: raceCourses.map((c) => ({
                label: c.label,
                payout: `Weights Spd x${c.weights.speed} / Sta x${c.weights.stamina} / Pwr x${c.weights.power} / Int x${c.weights.intelligence} / Lck x${c.weights.luck}`,
            })),
            footnote: `On the Race tab, scouting a track is free - it spins a random course (which weights the 5 stats differently) and reveals 3 rival creatures alongside yours, each with real odds. You then bet ${formatCheddar(
                minRaceStake
            )}-${formatCheddar(
                maxRaceStake
            )} on any one of the 4 to win - a favorite pays a lower multiplier, a longshot pays a higher one. Your own creature's win/loss record and level track whether it actually placed first, independent of who you bet on.`,
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
            howToPlay="Ranch: hatch a Cheddar Egg to add a creature to your roster (rarity is randomized - better tiers roll higher stats), feed it with a Feed item to raise every stat by a random amount (no ceiling), collect its item every 24 hours, or release it for a flat cheddar payout. Race: pick a creature and scout the track for free - a random course is spun and 3 rival creatures are revealed alongside yours, each with real odds. Bet on any one of the 4 to win and watch the race play out. Win or lose the bet, your own creature's record and level track whether it actually placed first. Inventory: sell collected items for cheddar, or use one (no effect yet). Shop: buy Feed."
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
