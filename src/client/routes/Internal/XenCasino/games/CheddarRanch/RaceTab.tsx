import { useEffect, useRef, useState } from "react";
import {
    Box,
    Button,
    CardActionArea,
    Checkbox,
    Chip,
    FormControlLabel,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import SportsScoreIcon from "@mui/icons-material/SportsScore";
import { useSnackbar } from "notistack";
import { formatCheddar } from "../../utils/currency";
import {
    BetRaceResult,
    PendingRace,
    RanchOdds,
    RanchRacer,
    RanchStats,
    useCasinoRanch,
} from "../../../../../hooks/casino/useCasinoRanch";
import {
    ActionButton,
    BASE_RACE_DURATION_S,
    COURSE_TICKET_KEY,
    durationForPlace,
    FORFEIT_INSURANCE_KEY,
    HARDENED_FEED_KEY,
    ordinal,
    RanchCard,
    SPIN_EMOJI,
    STAT_ICON,
    STAT_ORDER,
    TYPE_EMOJI,
} from "./shared";

const STAKE_PRESETS = [100, 250, 500, 1000, 2500, 5000];

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

// The course's single strongest-weighted stat, or undefined if it's a flat all-rounder
// course (every weight tied) - used to pick out that stat on the race field so a player can
// size up who's built for the course at a glance, not just read six numbers.
function favoredStatForCourse(weights: RanchStats): keyof RanchStats | undefined {
    const max = Math.max(...STAT_ORDER.map((key) => weights[key]));
    const top = STAT_ORDER.filter((key) => weights[key] === max);
    return top.length === 1 ? top[0] : undefined;
}

// Dense single-row stat display - just the same icons the Ranch tab's stat grid already
// uses, inlined next to their number with no tile borders or labels, so a 5-racer field
// stays compact instead of a full StatsGrid per racer.
function StatStrip({ stats, favoredStat }: { stats: RanchStats; favoredStat?: keyof RanchStats }) {
    return (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25 }}>
            {STAT_ORDER.map((key) => {
                const isFavored = key === favoredStat;
                return (
                    <Box
                        key={key}
                        sx={{ display: "flex", alignItems: "center", gap: 0.5, color: isFavored ? "warning.main" : "text.secondary" }}
                    >
                        {STAT_ICON[key]}
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isFavored ? "warning.main" : "text.primary" }}
                        >
                            {stats[key]}
                        </Typography>
                    </Box>
                );
            })}
        </Box>
    );
}

function RacerRow({ racer, odds, favoredStat }: { racer: RanchRacer; odds?: RanchOdds; favoredStat?: keyof RanchStats }) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 28 }}>{TYPE_EMOJI[racer.type]}</Typography>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {racer.name}
                            {racer.isPlayer ? " (You)" : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Level {racer.level}
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
            <StatStrip stats={racer.stats} favoredStat={favoredStat} />
        </Box>
    );
}

export default function RaceTab() {
    const {
        creatures,
        feedCooldownMs,
        minRaceStake,
        maxRaceStake,
        entryFee,
        pendingRace,
        shopItems,
        buyShopItem,
        isBuyingShopItem,
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
    const [spinEmojis, setSpinEmojis] = useState<string[]>(["🐾", "🐾", "🐾", "🐾", "🐾"]);
    const [betRacerId, setBetRacerId] = useState<string | null>(null);
    const [stake, setStake] = useState(minRaceStake || 100);
    const [raceResult, setRaceResult] = useState<BetRaceResult | null>(null);
    const [confirmingForfeit, setConfirmingForfeit] = useState(false);
    const [useCourseTicket, setUseCourseTicket] = useState(false);
    const [useDifficultyItem, setUseDifficultyItem] = useState(false);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const courseTicketItem = shopItems.find((i) => i.key === COURSE_TICKET_KEY);
    const hardenedFeedItem = shopItems.find((i) => i.key === HARDENED_FEED_KEY);
    const insuranceItem = shopItems.find((i) => i.key === FORFEIT_INSURANCE_KEY);
    const courseTicketOwned = courseTicketItem?.quantity ?? 0;
    const hardenedFeedOwned = hardenedFeedItem?.quantity ?? 0;
    const insuranceOwned = insuranceItem?.quantity ?? 0;

    const handleBuyRaceItem = (item: NonNullable<typeof courseTicketItem>) =>
        buyShopItem(item.key)
            .then(() => enqueueSnackbar(`Bought 1x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    const selectedCreature = creatures.find((c) => c.id === selectedId) ?? null;
    const pending: PendingRace | null = spinning
        ? null
        : pendingOverride ?? (pendingRace && pendingRace.creatureId === selectedId ? pendingRace : null);

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
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        const spinId = setInterval(() => {
            setSpinEmojis([0, 1, 2, 3, 4].map(() => SPIN_EMOJI[Math.floor(Math.random() * SPIN_EMOJI.length)]));
        }, 120);

        startRace({ creatureId: selectedCreature.id, useCourseTicket, useDifficultyItem })
            .then((r) => {
                setTimeout(() => {
                    clearInterval(spinId);
                    setSpinning(false);
                    setPendingOverride(r.pending);
                    setUseCourseTicket(false);
                    setUseDifficultyItem(false);
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
            .then((r) => {
                enqueueSnackbar(r.message, { variant: "info" });
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
            if (raceResult.placeBoost > 0) {
                enqueueSnackbar(
                    `${raceResult.creature.name} placed ${ordinal(raceResult.place)} and gained +${raceResult.placeBoost} to every stat!`,
                    { variant: "info" }
                );
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
        <Box ref={panelRef}>
            {!pending && !spinning && (
                <>
                    <Box sx={{ maxWidth: 480, mx: "auto", mb: 3 }}>
                        <ActionButton
                            icon={<SportsScoreIcon />}
                            label={selectedCreature ? `Race with ${selectedCreature.name} - ${formatCheddar(entryFee)} race fee` : "Pick a racer"}
                            description="Randomizes the course and your 4 rivals. The fee is non-refundable once paid, even if you forfeit."
                            color="warning"
                            disabled={!selectedCreature || isStartingRace}
                            onClick={handleStart}
                        />
                        {selectedCreature && (
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                                {courseTicketItem && (
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <FormControlLabel
                                            sx={{ flex: 1, minWidth: 0, mr: 0 }}
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={useCourseTicket}
                                                    disabled={courseTicketOwned === 0}
                                                    onChange={(e) => setUseCourseTicket(e.target.checked)}
                                                />
                                            }
                                            label={
                                                <Typography variant="caption" color="text.secondary">
                                                    Use a Course Ticket to reroll the course ({courseTicketOwned} owned)
                                                </Typography>
                                            }
                                        />
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            disabled={isBuyingShopItem}
                                            onClick={() => handleBuyRaceItem(courseTicketItem)}
                                            sx={{ textTransform: "none", flexShrink: 0 }}
                                        >
                                            Buy ({formatCheddar(courseTicketItem.price)})
                                        </Button>
                                    </Box>
                                )}
                                {hardenedFeedItem && (
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <FormControlLabel
                                            sx={{ flex: 1, minWidth: 0, mr: 0 }}
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={useDifficultyItem}
                                                    disabled={hardenedFeedOwned === 0}
                                                    onChange={(e) => setUseDifficultyItem(e.target.checked)}
                                                />
                                            }
                                            label={
                                                <Typography variant="caption" color="text.secondary">
                                                    Use Hardened Feed for tougher, better-paying rivals ({hardenedFeedOwned} owned)
                                                </Typography>
                                            }
                                        />
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            disabled={isBuyingShopItem}
                                            onClick={() => handleBuyRaceItem(hardenedFeedItem)}
                                            sx={{ textTransform: "none", flexShrink: 0 }}
                                        >
                                            Buy ({formatCheddar(hardenedFeedItem.price)})
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Box>
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
                    <Typography variant="subtitle1" sx={{ textAlign: "center", fontWeight: 700 }}>
                        Course: {pending.course.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mb: 2 }}>
                        {pending.course.description}
                    </Typography>

                    {!betRacerId ? (
                        <>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Pick a racer to bet on
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
                                {pending.racers.map((racer) => {
                                    const odds = pending.odds.find((o) => o.racerId === racer.id);
                                    return (
                                        <CardActionArea
                                            key={racer.id}
                                            onClick={() => setBetRacerId(racer.id)}
                                            sx={{ p: 1.5, borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}
                                        >
                                            <RacerRow racer={racer} odds={odds} favoredStat={favoredStatForCourse(pending.course.weights)} />
                                        </CardActionArea>
                                    );
                                })}
                            </Box>
                        </>
                    ) : (
                        <>
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">
                                    Your bet
                                </Typography>
                                <Button variant="text" size="small" sx={{ textTransform: "none" }} onClick={() => setBetRacerId(null)}>
                                    Change pick
                                </Button>
                            </Box>
                            <Box sx={{ p: 1.5, mb: 2, borderRadius: 1.5, border: "2px solid", borderColor: "primary.main" }}>
                                <RacerRow
                                    racer={pending.racers.find((r) => r.id === betRacerId)!}
                                    odds={pending.odds.find((o) => o.racerId === betRacerId)}
                                    favoredStat={favoredStatForCourse(pending.course.weights)}
                                />
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
                                description={`Betting on ${pending.racers.find((r) => r.id === betRacerId)?.name}${betRacerId === "player" ? " (your own creature)" : ""
                                    }`}
                                color="warning"
                                disabled={isBettingRace}
                                onClick={handleBet}
                            />
                        </>
                    )}

                    {!confirmingForfeit ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                            <Button
                                variant="text"
                                color="error"
                                fullWidth
                                sx={{ textTransform: "none" }}
                                disabled={isForfeitingRace}
                                onClick={() => setConfirmingForfeit(true)}
                            >
                                {insuranceOwned > 0 ? `Forfeit (refunds ${formatCheddar(Math.round(entryFee * 0.5))} - Forfeit Insurance)` : `Forfeit (lose ${formatCheddar(entryFee)})`}
                            </Button>
                            {insuranceItem && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={isBuyingShopItem}
                                    onClick={() => handleBuyRaceItem(insuranceItem)}
                                    sx={{ textTransform: "none", flexShrink: 0 }}
                                >
                                    Buy Insurance ({formatCheddar(insuranceItem.price)})
                                </Button>
                            )}
                        </Box>
                    ) : (
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1, p: 1.5, border: "1px solid", borderColor: "error.main", borderRadius: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                                {insuranceOwned > 0
                                    ? `Forfeit without betting? A Forfeit Insurance will be used automatically, refunding ${formatCheddar(
                                        Math.round(entryFee * 0.5)
                                    )} of the entry fee.`
                                    : `Forfeit without betting? The ${formatCheddar(entryFee)} entry fee is already gone either way.`}
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
