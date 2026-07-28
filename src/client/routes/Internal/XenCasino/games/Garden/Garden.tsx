import { useEffect, useState } from "react";
import {
    Box,
    Button,
    CardActionArea,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    List,
    ListItemButton,
    ListItemText,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import BugReportIcon from "@mui/icons-material/BugReport";
import ScienceIcon from "@mui/icons-material/Science";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { GardenSquare, useCasinoGarden } from "../../../../../hooks/casino/useCasinoGarden";

// Growth/watering deadlines are computed against wall-clock time on the server; this just
// forces a re-render often enough that countdowns and progress visibly tick without the
// player needing to refresh - the actual truth is always refetched on the
// useCasinoGarden hook's own interval, this only redraws the local clock between fetches.
function useNow(intervalMs: number) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

function formatCountdown(msRemaining: number): string {
    if (msRemaining <= 0) {
        return "Ready";
    }
    const totalMinutes = Math.ceil(msRemaining / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDuration(ms: number): string {
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    }
    return hours > 0 ? `${hours}h` : `${minutes}m`;
}

function multiplierRange(baseMultiplier: number, variance: number): string {
    const low = (baseMultiplier * (1 - variance)).toFixed(2);
    const high = (baseMultiplier * (1 + variance)).toFixed(2);
    return `${low}x - ${high}x`;
}

const SEED_EMOJI: Record<string, string> = {
    sprout: "🌱",
    clover: "🍀",
    nightshade: "🍄",
    "golden-vine": "🍇",
};
const EMPTY_EMOJI = "➕";
const DEAD_EMOJI = "💀";

function tileEmoji(square: GardenSquare): string {
    if (square.status === "empty") {
        return EMPTY_EMOJI;
    }
    if (square.status === "dead") {
        return DEAD_EMOJI;
    }
    return (square.seedType && SEED_EMOJI[square.seedType]) || "🌾";
}

function tileStatusLabel(square: GardenSquare): string {
    switch (square.status) {
        case "empty":
            return "Empty";
        case "dead":
            return "Dead";
        case "ready":
            return "Ready to harvest";
        default:
            return `Watered ${square.waterCount}/${square.waterAmount}`;
    }
}

const STATUS_COLOR: Record<GardenSquare["status"], "default" | "success" | "warning" | "error"> = {
    empty: "default",
    growing: "warning",
    ready: "success",
    dead: "error",
};

interface GardenTileProps {
    square: GardenSquare;
    onOpen: (squareId: number) => void;
}

// The compact grid tile - just an emoji, a progress bar, and a one-line status. Everything
// else (stats, watering/protection/harvest actions, seed picker) lives in the modal that
// opens on tap (see SquareDetails below).
function GardenTile({ square, onOpen }: GardenTileProps) {
    const progress =
        square.status === "ready"
            ? 100
            : square.status === "growing" && square.waterAmount > 0
              ? Math.min(100, (square.waterCount / square.waterAmount) * 100)
              : 0;

    return (
        <CardActionArea
            onClick={() => onOpen(square.squareId)}
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
            <Typography sx={{ fontSize: 40, lineHeight: 1 }}>{tileEmoji(square)}</Typography>
            <LinearProgress
                variant="determinate"
                value={progress}
                color={square.status === "ready" ? "success" : square.status === "dead" ? "error" : "warning"}
                sx={{ width: "100%", height: 6, borderRadius: 999, opacity: square.status === "empty" ? 0 : 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                {tileStatusLabel(square)}
            </Typography>
        </CardActionArea>
    );
}

interface SquareDetailsProps {
    square: GardenSquare;
    now: number;
}

// Full stats + every action for the selected square - rendered inside the modal, adapting
// to status exactly like the old inline SquareCard body did.
function SquareDetails({ square, now }: SquareDetailsProps) {
    const {
        seedTiers,
        protectionCost,
        waterCooldownMs,
        cleanupFee,
        plant,
        isPlanting,
        water,
        isWatering,
        protect,
        isProtecting,
        harvest,
        isHarvesting,
        clear,
        isClearing,
    } = useCasinoGarden();
    const { enqueueSnackbar } = useSnackbar();

    const msSinceWatered = square.lastWateredAt ? now - new Date(square.lastWateredAt).getTime() : Infinity;
    const onCooldown = msSinceWatered < waterCooldownMs;
    const cooldownRemaining = waterCooldownMs - msSinceWatered;

    const handlePlant = (seedType: string) =>
        plant({ squareId: square.squareId, seedType }).catch((e) => enqueueSnackbar(e.message || "Failed to plant", { variant: "error" }));
    const handleWater = () => water({ squareId: square.squareId }).catch((e) => enqueueSnackbar(e.message || "Failed to water", { variant: "error" }));
    const handleProtect = (item: "pesticide" | "fungicide") =>
        protect({ squareId: square.squareId, item }).catch((e) => enqueueSnackbar(e.message || "Failed to protect", { variant: "error" }));
    const handleHarvest = () =>
        harvest({ squareId: square.squareId })
            .then((r) => enqueueSnackbar(`Harvested ${formatCheddar(r.payout)} cheddar!`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to harvest", { variant: "error" }));
    const handleClear = () => clear({ squareId: square.squareId }).catch((e) => enqueueSnackbar(e.message || "Failed to clear", { variant: "error" }));

    if (square.status === "empty") {
        return (
            <List disablePadding>
                {seedTiers.map((tier) => (
                    <ListItemButton key={tier.key} disabled={isPlanting} onClick={() => handlePlant(tier.key)} sx={{ borderRadius: 1, mb: 0.5 }}>
                        <ListItemText
                            primary={`${tier.label} - ${formatCheddar(tier.cost)} cheddar`}
                            secondary={`Pays ${multiplierRange(tier.baseMultiplier, tier.variance)} - ${tier.waterAmount} waterings needed - vermin ${(
                                tier.verminChance * 100
                            ).toFixed(0)}% / disease ${(tier.diseaseChance * 100).toFixed(0)}% per check`}
                        />
                    </ListItemButton>
                ))}
            </List>
        );
    }

    if (square.status === "dead") {
        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
                <Typography variant="body2" color="text.secondary">
                    This plot's crop died. Clean it up before you can replant.
                </Typography>
                <Button variant="outlined" color="error" disabled={isClearing} onClick={handleClear}>
                    Clear Plot (Fee: {formatCheddar(cleanupFee)})
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {square.seedLabel}
                </Typography>
                <Chip label={square.status} size="small" color={STATUS_COLOR[square.status]} sx={{ textTransform: "capitalize" }} />
            </Box>

            <Typography variant="body2" color="text.secondary">
                Cost {formatCheddar(square.cost)} - pays {multiplierRange(square.baseMultiplier, square.variance)} - {square.waterAmount} waterings
                needed
            </Typography>

            <LinearProgress
                variant="determinate"
                value={square.waterAmount > 0 ? Math.min(100, (square.waterCount / square.waterAmount) * 100) : 0}
                color={square.status === "ready" ? "success" : "warning"}
                sx={{ height: 6, borderRadius: 999 }}
            />
            <Typography variant="caption" color="text.secondary">
                {square.status === "ready" ? "Ready to harvest" : `Watered ${square.waterCount}/${square.waterAmount}`}
            </Typography>

            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {square.status === "growing" && (
                    <Chip
                        size="small"
                        icon={<WaterDropIcon />}
                        label={onCooldown ? `Cooldown ${formatCountdown(cooldownRemaining)}` : "Ready to water"}
                        color={onCooldown ? "default" : "info"}
                        variant={onCooldown ? "outlined" : "filled"}
                    />
                )}
                {square.protection.pesticide && <Chip size="small" icon={<BugReportIcon />} label="Pesticide" color="success" />}
                {square.protection.fungicide && <Chip size="small" icon={<ScienceIcon />} label="Fungicide" color="success" />}
            </Box>

            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {square.status === "growing" && (
                    <Button variant="contained" disabled={isWatering || onCooldown} onClick={handleWater}>
                        Water
                    </Button>
                )}
                {square.status === "growing" && !square.protection.pesticide && (
                    <Button variant="outlined" disabled={isProtecting} onClick={() => handleProtect("pesticide")}>
                        Pesticide ({formatCheddar(protectionCost.pesticide)})
                    </Button>
                )}
                {square.status === "growing" && !square.protection.fungicide && (
                    <Button variant="outlined" disabled={isProtecting} onClick={() => handleProtect("fungicide")}>
                        Fungicide ({formatCheddar(protectionCost.fungicide)})
                    </Button>
                )}
                {square.status === "ready" && (
                    <Button variant="contained" color="success" disabled={isHarvesting} onClick={handleHarvest}>
                        Harvest
                    </Button>
                )}
            </Box>
        </Box>
    );
}

export default function Garden() {
    const { squares, seedTiers, waterCooldownMs, neglectGraceMs, cleanupFee, isLoading } = useCasinoGarden();
    const now = useNow(15 * 1000);
    const [selectedSquareId, setSelectedSquareId] = useState<number | null>(null);

    const selectedSquare = squares.find((s) => s.squareId === selectedSquareId) ?? null;

    const oddsSections: OddsSection[] = [
        {
            title: "Seeds",
            rows: seedTiers.map((t) => ({
                label: `${t.label} (${formatCheddar(t.cost)}, ${t.waterAmount} waterings)`,
                payout: `${multiplierRange(t.baseMultiplier, t.variance)} - vermin ${(t.verminChance * 100).toFixed(0)}% / disease ${(
                    t.diseaseChance * 100
                ).toFixed(0)}% per check`,
            })),
            footnote: `Harvest payout is cost x base multiplier, swung +/- the seed's variance by casino luck. Watering is on a ${formatDuration(
                waterCooldownMs
            )} cooldown per plot; a vermin hit adds one more required watering instead of hurting the crop outright. A plot left completely unwatered for ${formatDuration(
                neglectGraceMs
            )} starts losing one delivered watering per hour until it's rewatered or dies - a dead plot costs ${formatCheddar(
                cleanupFee
            )} to clean up before replanting.`,
        },
    ];

    return (
        <GameWrapper
            title="Casino Garden"
            howToPlay={`Tap a plot to plant a seed, water it, or harvest it. Each seed needs a set number of waterings to mature - water each plot at most once every ${formatDuration(
                waterCooldownMs
            )}. There's no rush: a plot only starts losing progress if it goes a full ${formatDuration(
                neglectGraceMs
            )} with zero watering, after which it loses one delivered watering every hour until it's rewatered or runs out and dies. Unprotected plots can also be struck by vermin (adds one more required watering) or disease (kills the crop) - buy pesticide/fungicide to guard against them. A dead plot costs ${formatCheddar(
                cleanupFee
            )} to clean up before you can replant it.`}
            oddsSections={oddsSections}
        >
            {isLoading ? (
                <LinearProgress sx={{ mt: 4 }} />
            ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, mt: 2 }}>
                    {squares.map((square) => (
                        <GardenTile key={square.squareId} square={square} onOpen={setSelectedSquareId} />
                    ))}
                </Box>
            )}

            <Dialog open={!!selectedSquare} onClose={() => setSelectedSquareId(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Plot {selectedSquareId !== null ? selectedSquareId + 1 : ""}
                    <IconButton onClick={() => setSelectedSquareId(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>{selectedSquare && <SquareDetails square={selectedSquare} now={now} />}</DialogContent>
            </Dialog>
        </GameWrapper>
    );
}
