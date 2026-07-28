import { useEffect, useState } from "react";
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    List,
    ListItemButton,
    ListItemText,
    Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import GavelIcon from "@mui/icons-material/Gavel";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { PrinterPart, useCasinoPrinter } from "../../../../../hooks/casino/useCasinoPrinter";

const MAX_PICKS = 3;

// Same "force a redraw between fetches" trick as Garden - the run's real state (its
// multiplier/risk) is server-computed and refetched on the hook's own interval; this just
// keeps the two gauges visibly animating in between those refetches.
function useNow(intervalMs: number) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

function signed(value: number): string {
    const pct = Math.round(value * 100);
    return `${pct >= 0 ? "+" : ""}${pct}%`;
}

interface PartPickerProps {
    open: boolean;
    parts: PrinterPart[];
    isStarting: boolean;
    onClose: () => void;
    onStart: (partKeys: string[]) => void;
}

// Pick exactly 3 parts (repeats allowed - tapping the same one again installs another
// copy) - their cost/rateBonus/raidBonus all sum together into this run's own curve
// (see the /start route handler). This preview sums the same way the server will, so
// what's shown here is what actually gets installed.
function PartPicker({ open, parts, isStarting, onClose, onStart }: PartPickerProps) {
    const [picks, setPicks] = useState<string[]>([]);

    const addPick = (key: string) => {
        if (picks.length < MAX_PICKS) {
            setPicks((p) => [...p, key]);
        }
    };
    const removePick = (index: number) => setPicks((p) => p.filter((_, i) => i !== index));
    const handleClose = () => {
        setPicks([]);
        onClose();
    };
    const handleStart = () => onStart(picks);

    const totalCost = picks.reduce((sum, key) => sum + (parts.find((p) => p.key === key)?.cost ?? 0), 0);
    const totalRate = picks.reduce((sum, key) => sum + (parts.find((p) => p.key === key)?.rateBonus ?? 0), 0);
    const totalRaid = picks.reduce((sum, key) => sum + (parts.find((p) => p.key === key)?.raidBonus ?? 0), 0);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                Pick 3 Parts
                <IconButton onClick={handleClose} aria-label="Close">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 2, minHeight: 32 }}>
                    {picks.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            Tap up to 3 below (the same one twice is fine).
                        </Typography>
                    )}
                    {picks.map((key, i) => (
                        <Chip
                            key={`${key}-${i}`}
                            label={parts.find((p) => p.key === key)?.label ?? key}
                            onDelete={() => removePick(i)}
                            color="warning"
                        />
                    ))}
                </Box>

                {picks.length > 0 && (
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                        <Chip size="small" label={`Cost ${formatCheddar(totalCost)}`} />
                        <Chip size="small" label={`Rate ${signed(totalRate)}`} color={totalRate >= 0 ? "success" : "default"} />
                        <Chip size="small" label={`Raid ${signed(totalRaid)}`} color={totalRaid > 0 ? "error" : "success"} />
                    </Box>
                )}

                <List disablePadding>
                    {parts.map((part) => (
                        <ListItemButton
                            key={part.key}
                            disabled={picks.length >= MAX_PICKS}
                            onClick={() => addPick(part.key)}
                            sx={{ borderRadius: 1, mb: 0.5 }}
                        >
                            <ListItemText
                                primary={`${part.label} - ${formatCheddar(part.cost)}`}
                                secondary={`${part.description} (Rate ${signed(part.rateBonus)}, Raid ${signed(part.raidBonus)})`}
                            />
                        </ListItemButton>
                    ))}
                </List>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button
                    variant="contained"
                    color="warning"
                    fullWidth
                    disabled={picks.length !== MAX_PICKS || isStarting}
                    onClick={handleStart}
                >
                    Install &amp; Run ({formatCheddar(totalCost)})
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default function Printer() {
    const {
        rigLevel,
        maxRigLevel,
        run,
        parts,
        bribeCost,
        upgradeCost,
        isLoading,
        start,
        isStarting,
        bribe,
        isBribing,
        collect,
        isCollecting,
        upgrade,
        isUpgrading,
    } = useCasinoPrinter();
    const { enqueueSnackbar } = useSnackbar();
    const [pickerOpen, setPickerOpen] = useState(false);
    useNow(2 * 1000);

    const handleStart = (partKeys: string[]) =>
        start({ partKeys })
            .then(() => setPickerOpen(false))
            .catch((e) => enqueueSnackbar(e.message || "Failed to start print run", { variant: "error" }));
    const handleBribe = () => bribe().catch((e) => enqueueSnackbar(e.message || "Failed to bribe", { variant: "error" }));
    const handleCollect = () =>
        collect()
            .then((r) =>
                enqueueSnackbar(
                    r.raided ? "Raided! The rig was seized - nothing collected." : `Collected ${formatCheddar(r.payout)} cheddar!`,
                    { variant: r.raided ? "error" : "success" }
                )
            )
            .catch((e) => enqueueSnackbar(e.message || "Failed to collect", { variant: "error" }));
    const handleUpgrade = () => upgrade().catch((e) => enqueueSnackbar(e.message || "Failed to upgrade", { variant: "error" }));

    const oddsSections: OddsSection[] = [
        {
            title: "Parts",
            rows: parts.map((p) => ({
                label: `${p.label} (${formatCheddar(p.cost)})`,
                payout: `Rate ${signed(p.rateBonus)}, Raid ${signed(p.raidBonus)}`,
            })),
            footnote: "Pick 3 (repeats allowed) when starting a print run - their cost/rate/raid bonuses all sum together into that run's own curve.",
        },
        {
            title: "Economics",
            rows: [
                { label: "Bribe", payout: `${formatCheddar(bribeCost)} - resets raid risk` },
                { label: "Upgrade Rig", payout: `${formatCheddar(upgradeCost)} - reaches peak faster (max level ${maxRigLevel})` },
            ],
            footnote: "Payout multiplier starts below breakeven and rises toward a peak the longer the run goes, then plateaus - collecting immediately is a guaranteed loss. Raid risk starts real from the first check and rises further the longer it's been since your last bribe - each bribe on the same run costs more than the last.",
        },
    ];

    return (
        <GameWrapper
            title="Money Printer"
            howToPlay="Pick 3 parts to install and start a print run - their cost, rate, and raid-risk bonuses all add together into that run's own curve. Collecting right away is a loss - the payout multiplier starts below breakeven and climbs toward a peak the longer you let it run. Raid risk is real from the start too and keeps climbing the longer it's been since your last bribe. Bribe the right people to knock risk back down (each bribe on the same run costs more than the last), or cash out before your rig gets seized."
            oddsSections={oddsSections}
        >
            {isLoading ? (
                <LinearProgress sx={{ mt: 4 }} />
            ) : (
                <Card variant="outlined" sx={{ mt: 3 }}>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", py: 4 }}>
                        <PrintIcon sx={{ fontSize: 56, color: "warning.main" }} />
                        <Typography variant="subtitle1" color="text.secondary">
                            Rig Level {rigLevel} / {maxRigLevel}
                        </Typography>

                        {!run && (
                            <Button
                                variant="contained"
                                color="warning"
                                size="large"
                                disabled={isStarting}
                                onClick={() => setPickerOpen(true)}
                                sx={{ fontWeight: 800, px: 4 }}
                            >
                                Start Print Run
                            </Button>
                        )}

                        {run && (
                            <Box sx={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 2 }}>
                                {run.parts.length > 0 && (
                                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
                                        {run.parts.map((label, i) => (
                                            <Chip key={i} size="small" label={label} variant="outlined" />
                                        ))}
                                    </Box>
                                )}

                                <Box>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                        <Typography variant="body2">Payout</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {run.currentMultiplier.toFixed(2)}x ({formatCheddar(Math.round(run.partsCost * run.currentMultiplier))})
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(100, (run.currentMultiplier / run.peakMultiplier) * 100)}
                                        color="success"
                                        sx={{ height: 10, borderRadius: 999 }}
                                    />
                                </Box>

                                <Box>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                        <Typography variant="body2">Raid Risk</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {run.raidRiskPercent}%
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={run.raidRiskPercent}
                                        color="error"
                                        sx={{ height: 10, borderRadius: 999 }}
                                    />
                                </Box>

                                <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center", mt: 1 }}>
                                    <Button variant="outlined" color="error" startIcon={<GavelIcon />} disabled={isBribing} onClick={handleBribe}>
                                        Bribe ({formatCheddar(run.nextBribeCost)}){run.bribeCount > 0 ? ` - #${run.bribeCount + 1}` : ""}
                                    </Button>
                                    <Button variant="contained" color="success" disabled={isCollecting} onClick={handleCollect}>
                                        Collect Now
                                    </Button>
                                </Box>
                            </Box>
                        )}

                        {!run && rigLevel < maxRigLevel && (
                            <Button variant="text" disabled={isUpgrading} onClick={handleUpgrade} sx={{ mt: 1 }}>
                                Upgrade Rig ({formatCheddar(upgradeCost)})
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}

            <PartPicker open={pickerOpen} parts={parts} isStarting={isStarting} onClose={() => setPickerOpen(false)} onStart={handleStart} />
        </GameWrapper>
    );
}
