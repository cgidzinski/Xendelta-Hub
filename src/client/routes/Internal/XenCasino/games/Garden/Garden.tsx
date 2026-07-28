import { useEffect, useState } from "react";
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    LinearProgress,
    Menu,
    MenuItem,
    Typography,
} from "@mui/material";
import LocalFloristIcon from "@mui/icons-material/LocalFlorist";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import BugReportIcon from "@mui/icons-material/BugReport";
import ScienceIcon from "@mui/icons-material/Science";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { GardenSquare, useCasinoGarden } from "../../../../../hooks/casino/useCasinoGarden";

// Growth/watering deadlines are computed against wall-clock time on the server; this just
// forces a re-render often enough that countdowns and the "watered today" state visibly
// tick without the player needing to refresh - the actual truth is always refetched
// on the useCasinoGarden hook's own interval, this only redraws the local clock between fetches.
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

const STATUS_COLOR: Record<GardenSquare["status"], "default" | "success" | "warning" | "error"> = {
    empty: "default",
    growing: "warning",
    ready: "success",
    dead: "error",
};

interface SquareCardProps {
    square: GardenSquare;
    now: number;
    onPlantClick: (event: React.MouseEvent<HTMLElement>, squareId: number) => void;
}

function SquareCard({ square, now, onPlantClick }: SquareCardProps) {
    const { water, isWatering, protect, isProtecting, harvest, isHarvesting, clear, isClearing } = useCasinoGarden();
    const { enqueueSnackbar } = useSnackbar();

    const readyAt = square.readyAt ? new Date(square.readyAt).getTime() : null;
    const plantedAt = square.plantedAt ? new Date(square.plantedAt).getTime() : null;
    const totalDuration = readyAt && plantedAt ? readyAt - plantedAt : null;
    const remaining = readyAt ? readyAt - now : null;
    const progress = totalDuration && remaining !== null ? Math.min(100, 100 * (1 - Math.max(0, remaining) / totalDuration)) : 0;

    // Needs a fresh watering once a full waterIntervalMs has elapsed since the last one -
    // missing a second full interval on top of that kills the square (see resolveGardenSquare).
    const msSinceWatered = square.lastWateredAt ? now - new Date(square.lastWateredAt).getTime() : 0;
    const needsWater = !!square.waterIntervalMs && msSinceWatered >= square.waterIntervalMs;

    const handleWater = () => water({ squareId: square.squareId }).catch((e) => enqueueSnackbar(e.message || "Failed to water", { variant: "error" }));
    const handleProtect = (item: "pesticide" | "fungicide") =>
        protect({ squareId: square.squareId, item }).catch((e) => enqueueSnackbar(e.message || "Failed to protect", { variant: "error" }));
    const handleHarvest = () =>
        harvest({ squareId: square.squareId })
            .then((r) => enqueueSnackbar(`Harvested ${formatCheddar(r.payout)} cheddar!`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to harvest", { variant: "error" }));
    const handleClear = () => clear({ squareId: square.squareId }).catch((e) => enqueueSnackbar(e.message || "Failed to clear", { variant: "error" }));

    return (
        <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1, minHeight: 190, p: 2, "&:last-child": { pb: 2 } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {square.seedLabel ?? "Empty Plot"}
                    </Typography>
                    <Chip label={square.status} size="small" color={STATUS_COLOR[square.status]} sx={{ textTransform: "capitalize" }} />
                </Box>

                {square.status === "empty" && (
                    <Button
                        variant="outlined"
                        startIcon={<LocalFloristIcon />}
                        onClick={(e) => onPlantClick(e, square.squareId)}
                        sx={{ mt: "auto" }}
                    >
                        Plant Seed
                    </Button>
                )}

                {(square.status === "growing" || square.status === "ready") && (
                    <>
                        <LinearProgress
                            variant="determinate"
                            value={progress}
                            color={square.status === "ready" ? "success" : "warning"}
                            sx={{ height: 6, borderRadius: 999 }}
                        />
                        <Typography variant="caption" color="text.secondary">
                            {square.status === "ready" ? "Ready to harvest" : formatCountdown(remaining ?? 0)}
                        </Typography>

                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                            <Chip
                                size="small"
                                icon={<WaterDropIcon />}
                                label={needsWater ? "Needs water" : "Watered"}
                                color={needsWater ? "error" : "info"}
                                variant={needsWater ? "outlined" : "filled"}
                            />
                            {square.protection.pesticide && <Chip size="small" icon={<BugReportIcon />} label="Pesticide" color="success" />}
                            {square.protection.fungicide && <Chip size="small" icon={<ScienceIcon />} label="Fungicide" color="success" />}
                        </Box>

                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: "auto" }}>
                            {needsWater && (
                                <Button size="small" variant="contained" disabled={isWatering} onClick={handleWater}>
                                    Water
                                </Button>
                            )}
                            {square.status === "growing" && !square.protection.pesticide && (
                                <Button size="small" variant="outlined" disabled={isProtecting} onClick={() => handleProtect("pesticide")}>
                                    Pesticide
                                </Button>
                            )}
                            {square.status === "growing" && !square.protection.fungicide && (
                                <Button size="small" variant="outlined" disabled={isProtecting} onClick={() => handleProtect("fungicide")}>
                                    Fungicide
                                </Button>
                            )}
                            {square.status === "ready" && (
                                <Button size="small" variant="contained" color="success" disabled={isHarvesting} onClick={handleHarvest}>
                                    Harvest
                                </Button>
                            )}
                        </Box>
                    </>
                )}

                {square.status === "dead" && (
                    <>
                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                            This plot's crop died. Clear it to replant.
                        </Typography>
                        <Button size="small" variant="outlined" color="error" disabled={isClearing} onClick={handleClear} sx={{ mt: "auto" }}>
                            Clear Plot
                        </Button>
                    </>
                )}

                {square.status !== "empty" && square.waterIntervalMs && (
                    <Typography variant="caption" color="text.secondary">
                        Cost {formatCheddar(square.cost)} - pays {multiplierRange(square.baseMultiplier, square.variance)} - water every{" "}
                        {formatDuration(square.waterIntervalMs)}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
}

export default function Garden() {
    const { squares, seedTiers, protectionCost, isLoading, plant, isPlanting } = useCasinoGarden();
    const { enqueueSnackbar } = useSnackbar();
    const now = useNow(15 * 1000);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [plantingSquareId, setPlantingSquareId] = useState<number | null>(null);

    const openSeedMenu = (event: React.MouseEvent<HTMLElement>, squareId: number) => {
        setMenuAnchor(event.currentTarget);
        setPlantingSquareId(squareId);
    };
    const closeSeedMenu = () => {
        setMenuAnchor(null);
        setPlantingSquareId(null);
    };
    const handlePlant = (seedType: string) => {
        if (plantingSquareId === null) {
            return;
        }
        plant({ squareId: plantingSquareId, seedType })
            .catch((e) => enqueueSnackbar(e.message || "Failed to plant", { variant: "error" }))
            .finally(closeSeedMenu);
    };

    const oddsSections: OddsSection[] = [
        {
            title: "Seeds",
            rows: seedTiers.map((t) => ({
                label: `${t.label} (${formatCheddar(t.cost)}, water every ${formatDuration(t.waterIntervalMs)})`,
                payout: `${multiplierRange(t.baseMultiplier, t.variance)} - vermin ${(t.verminChance * 100).toFixed(0)}% / disease ${(
                    t.diseaseChance * 100
                ).toFixed(0)}% per check`,
            })),
            footnote: "Harvest payout is cost x base multiplier, swung +/- the seed's variance by casino luck. Riskier/higher-maintenance seeds pay a bigger base multiplier.",
        },
        {
            title: "Protection",
            rows: [
                { label: "Pesticide", payout: `${formatCheddar(protectionCost.pesticide)} - blocks vermin` },
                { label: "Fungicide", payout: `${formatCheddar(protectionCost.fungicide)} - blocks disease` },
            ],
            footnote: "Unprotected growing plots roll a vermin/disease chance once per watering interval.",
        },
    ];

    return (
        <GameWrapper
            title="Casino Garden"
            howToPlay="Plant a seed in any of the 9 plots. Each seed has its own cost, grow time, watering frequency, and risk - miss a full watering interval and the plot dies. Unprotected plots can also be struck by vermin (delaying harvest) or disease (killing the crop) - buy pesticide/fungicide to guard against them. Harvest a ready plot for a payout based on the seed's cost, base multiplier, and a little casino luck."
            oddsSections={oddsSections}
        >
            {isLoading ? (
                <LinearProgress sx={{ mt: 4 }} />
            ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, mt: 2 }}>
                    {squares.map((square) => (
                        <SquareCard key={square.squareId} square={square} now={now} onPlantClick={openSeedMenu} />
                    ))}
                </Box>
            )}

            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeSeedMenu}>
                {seedTiers.map((tier) => (
                    <MenuItem key={tier.key} disabled={isPlanting} onClick={() => handlePlant(tier.key)} sx={{ display: "block", py: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {tier.label} - {formatCheddar(tier.cost)} cheddar
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                            Pays {multiplierRange(tier.baseMultiplier, tier.variance)} - water every {formatDuration(tier.waterIntervalMs)} - vermin{" "}
                            {(tier.verminChance * 100).toFixed(0)}% / disease {(tier.diseaseChance * 100).toFixed(0)}% per check
                        </Typography>
                    </MenuItem>
                ))}
            </Menu>
        </GameWrapper>
    );
}
