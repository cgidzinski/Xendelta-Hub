import { ComponentType, ReactNode, useEffect, useState } from "react";
import {
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    LinearProgress,
    List,
    ListItemButton,
    Stack,
    SvgIconProps,
    Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import GavelIcon from "@mui/icons-material/Gavel";
import CloseIcon from "@mui/icons-material/Close";
import BuildIcon from "@mui/icons-material/Build";
import AirIcon from "@mui/icons-material/Air";
import MemoryIcon from "@mui/icons-material/Memory";
import BoltIcon from "@mui/icons-material/Bolt";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import SecurityIcon from "@mui/icons-material/Security";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
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

const PART_ICON: Record<string, ComponentType<SvgIconProps>> = {
    "case-fan": AirIcon,
    "ram-upgrade": MemoryIcon,
    "turbo-fan": BoltIcon,
    "liquid-nitrogen": AcUnitIcon,
    "silent-case": VolumeOffIcon,
    "faraday-cage": SecurityIcon,
};

// A single icon + one-line-of-context stat row, same pattern as Garden's seed/action
// rows - so both persistent games' modals read the same way.
function StatLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box sx={{ display: "flex", color: "text.secondary", "& svg": { fontSize: 16 } }}>{icon}</Box>
            <Typography variant="caption" color="text.secondary">
                {children}
            </Typography>
        </Box>
    );
}

// A signed rate/raid number, colored green when it's working in the player's favor and
// red when it isn't - `inverse` flips which sign counts as "favor" (raid: negative is
// good, rate: positive is good).
function SignedStat({ value, inverse }: { value: number; inverse?: boolean }) {
    const favorable = inverse ? value <= 0 : value >= 0;
    return (
        <Typography component="span" variant="caption" sx={{ fontWeight: 700, color: favorable ? "success.main" : "error.main" }}>
            {signed(value)}
        </Typography>
    );
}

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

// A compact card for a part actually installed on the current run - just enough to see
// what it's contributing at a glance without reopening the picker. `raidBonus` is omitted
// for the Machine Upgrade card (it's a pure rate boost with no raid cost).
function InstalledPartCard({ icon, label, rateBonus, raidBonus }: { icon: ReactNode; label: string; rateBonus: number; raidBonus?: number }) {
    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1, textAlign: "center" }}>
            <Box sx={{ color: "text.secondary", display: "flex", justifyContent: "center", "& svg": { fontSize: 20 } }}>{icon}</Box>
            <Typography variant="caption" sx={{ display: "block", fontWeight: 700, mt: 0.25 }}>
                {label}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", fontSize: 11 }}>
                Rate <SignedStat value={rateBonus} />
            </Typography>
            {raidBonus !== undefined && (
                <Typography variant="caption" sx={{ display: "block", fontSize: 11 }}>
                    Raid <SignedStat value={raidBonus} inverse />
                </Typography>
            )}
        </Box>
    );
}

interface PartOptionProps {
    part: PrinterPart;
    disabled: boolean;
    onSelect: () => void;
}

// One part choice - an icon, the name + price on their own line, then the flavor text and
// its rate/raid bonuses each on their own row, same shape as Garden's seed picker rows.
// Stays tappable after being picked (repeats are a valid build), so unlike Garden's seeds
// this one never disables/hides itself once selected - only once 3 are already picked.
function PartOption({ part, disabled, onSelect }: PartOptionProps) {
    const Icon = PART_ICON[part.key] ?? MemoryIcon;
    return (
        <ListItemButton
            disabled={disabled}
            onClick={onSelect}
            sx={{
                alignItems: "flex-start",
                gap: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                mb: 1,
                py: 1.25,
                px: 1.5,
                "&:hover": { borderColor: "primary.main" },
            }}
        >
            <Avatar sx={{ bgcolor: "action.hover", width: 44, height: 44, flexShrink: 0 }}>
                <Icon fontSize="small" />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {part.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "error.main", flexShrink: 0 }}>
                        {formatCheddar(part.cost)}
                    </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, mb: 0.75 }}>
                    {part.description}
                </Typography>
                <Stack spacing={0.5}>
                    <StatLine icon={<TrendingUpIcon />}>
                        Rate <SignedStat value={part.rateBonus} />
                    </StatLine>
                    <StatLine icon={<WarningAmberIcon />}>
                        Raid <SignedStat value={part.raidBonus} inverse />
                    </StatLine>
                </Stack>
            </Box>
        </ListItemButton>
    );
}

interface PartPickerProps {
    open: boolean;
    parts: PrinterPart[];
    machineUpgradeCost: number;
    isStarting: boolean;
    onClose: () => void;
    onStart: (partKeys: string[], useMachineUpgrade: boolean) => void;
}

// Pick 0-3 parts (repeats allowed - tapping the same one again installs another
// copy) - their cost/rateBonus/raidBonus all sum together into this run's own curve
// (see the /start route handler). Picking none runs the stock rig's base curve for
// free. Machine Upgrade is a 4th, optional, single-use purchase - a pure rate boost
// with no raid cost, bought fresh same as the parts (no persistent "rig level" to
// grind toward). This preview sums the same way the server will, so what's shown
// here is what actually gets installed.
function PartPicker({ open, parts, machineUpgradeCost, isStarting, onClose, onStart }: PartPickerProps) {
    const [picks, setPicks] = useState<string[]>([]);
    const [machineUpgrade, setMachineUpgrade] = useState(false);

    const addPick = (key: string) => {
        if (picks.length < MAX_PICKS) {
            setPicks((p) => [...p, key]);
        }
    };
    const removePick = (index: number) => setPicks((p) => p.filter((_, i) => i !== index));
    const handleClose = () => {
        setPicks([]);
        setMachineUpgrade(false);
        onClose();
    };
    const handleStart = () => onStart(picks, machineUpgrade);

    const totalCost =
        picks.reduce((sum, key) => sum + (parts.find((p) => p.key === key)?.cost ?? 0), 0) + (machineUpgrade ? machineUpgradeCost : 0);
    const totalRate = picks.reduce((sum, key) => sum + (parts.find((p) => p.key === key)?.rateBonus ?? 0), 0) + (machineUpgrade ? 0.5 : 0);
    const totalRaid = picks.reduce((sum, key) => sum + (parts.find((p) => p.key === key)?.raidBonus ?? 0), 0);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                Pick Parts (Optional)
                <IconButton onClick={handleClose} aria-label="Close">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pb: 3 }}>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, mb: 2.5 }}>
                    <Avatar sx={{ width: 56, height: 56, fontSize: 28, bgcolor: "action.hover" }}>
                        <PrintIcon />
                    </Avatar>
                    <Typography variant="body2" color="text.secondary">
                        Tap up to 3 below (the same part twice is a valid build), or skip parts entirely to run the stock rig
                    </Typography>
                </Box>

                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mb: 2, minHeight: 32 }}>
                    {picks.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            No parts picked yet
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

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, mb: 2 }}>
                    <StatTile label="Cost" value={formatCheddar(totalCost)} />
                    <StatTile label="Rate" value={signed(totalRate)} color={totalRate >= 0 ? "success.main" : "error.main"} />
                    <StatTile label="Raid" value={signed(totalRaid)} color={totalRaid > 0 ? "error.main" : "success.main"} />
                </Box>

                <List disablePadding>
                    {parts.map((part) => (
                        <PartOption key={part.key} part={part} disabled={picks.length >= MAX_PICKS} onSelect={() => addPick(part.key)} />
                    ))}
                </List>

                <Box
                    onClick={() => setMachineUpgrade((v) => !v)}
                    sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: machineUpgrade ? "success.main" : "divider",
                        mt: 1,
                        py: 1.25,
                        px: 1.5,
                        cursor: "pointer",
                    }}
                >
                    <Avatar sx={{ bgcolor: "action.hover", width: 44, height: 44, flexShrink: 0 }}>
                        <BuildIcon fontSize="small" />
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                Machine Upgrade
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: "error.main", flexShrink: 0 }}>
                                {formatCheddar(machineUpgradeCost)}
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, mb: 0.75 }}>
                            Optional, single-use for this run only
                        </Typography>
                        <StatLine icon={<TrendingUpIcon />}>
                            Rate <SignedStat value={0.5} /> - no raid cost
                        </StatLine>
                    </Box>
                    <Checkbox
                        checked={machineUpgrade}
                        onChange={(e) => setMachineUpgrade(e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        sx={{ flexShrink: 0 }}
                    />
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button
                    variant="contained"
                    color="warning"
                    fullWidth
                    disabled={picks.length > MAX_PICKS || isStarting}
                    onClick={handleStart}
                >
                    Install &amp; Run ({formatCheddar(totalCost)})
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default function Printer() {
    const { run, parts, bribeCost, machineUpgradeCost, isLoading, start, isStarting, bribe, isBribing, collect, isCollecting } =
        useCasinoPrinter();
    const { enqueueSnackbar } = useSnackbar();
    const [pickerOpen, setPickerOpen] = useState(false);
    useNow(2 * 1000);

    const handleStart = (partKeys: string[], useMachineUpgrade: boolean) =>
        start({ partKeys, useMachineUpgrade })
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

    // What collecting right now would actually net - deriving netPayout from the already-
    // rounded payoutNow (rather than a fresh partsCost * currentMultiplier - partsCost)
    // keeps the three tiles below arithmetically consistent (Spent - Payout Now == Net).
    const payoutNow = run ? Math.round(run.partsCost * run.currentMultiplier) : 0;
    const netPayout = run ? payoutNow - run.partsCost : 0;

    const oddsSections: OddsSection[] = [
        {
            title: "Parts",
            rows: parts.map((p) => ({
                label: `${p.label} (${formatCheddar(p.cost)})`,
                payout: `Rate ${signed(p.rateBonus)}, Raid ${signed(p.raidBonus)}`,
            })),
            footnote: "Pick up to 3 (repeats allowed, or skip parts entirely to run the stock rig) when starting a print run - their cost/rate/raid bonuses all sum together into that run's own curve. An optional Machine Upgrade adds pure rate with no raid cost - both are single-use, bought fresh for that one run only.",
        },
        {
            title: "Economics",
            rows: [{ label: "Bribe", payout: `${formatCheddar(bribeCost)} - resets raid risk` }],
            footnote: "Payout multiplier starts below breakeven and rises toward a peak the longer the run goes, then plateaus - collecting immediately is a guaranteed loss. Raid risk starts real from the first check and rises further the longer it's been since your last bribe - each bribe on the same run costs more than the last.",
        },
    ];

    return (
        <GameWrapper
            title="Money Printer"
            howToPlay="Optionally pick up to 3 parts to install, then start a print run - their cost, rate, and raid-risk bonuses all add together into that run's own curve. Skip parts entirely to run the stock rig for free. An optional Machine Upgrade adds pure rate with no raid cost. Everything is bought fresh each run - there's no permanent upgrade to grind toward. Collecting right away is a loss - the payout multiplier starts below breakeven and climbs toward a peak the longer you let it run. Raid risk is real from the start too and keeps climbing the longer it's been since your last bribe. Bribe the right people to knock risk back down (each bribe on the same run costs more than the last), or cash out before your rig gets seized."
            oddsSections={oddsSections}
        >
            {isLoading ? (
                <LinearProgress sx={{ mt: 4 }} />
            ) : (
                <Card variant="outlined" sx={{ mt: 3 }}>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", py: 4 }}>
                        <PrintIcon sx={{ fontSize: 56, color: "warning.main" }} />

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
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: `repeat(${run.parts.length + (run.usedMachineUpgrade ? 1 : 0)}, 1fr)`,
                                            gap: 1,
                                        }}
                                    >
                                        {run.parts.map((part, i) => {
                                            const Icon = PART_ICON[part.key] ?? MemoryIcon;
                                            return (
                                                <InstalledPartCard
                                                    key={i}
                                                    icon={<Icon fontSize="small" />}
                                                    label={part.label}
                                                    rateBonus={part.rateBonus}
                                                    raidBonus={part.raidBonus}
                                                />
                                            );
                                        })}
                                        {run.usedMachineUpgrade && (
                                            <InstalledPartCard
                                                icon={<BuildIcon fontSize="small" />}
                                                label="Machine Upgrade"
                                                rateBonus={run.machineUpgradeRateBonus}
                                            />
                                        )}
                                    </Box>
                                )}

                                {run.parts.length > 0 && (
                                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                                        <StatTile
                                            label="Net Rate"
                                            value={
                                                <SignedStat
                                                    value={
                                                        run.parts.reduce((sum, p) => sum + p.rateBonus, 0) +
                                                        (run.usedMachineUpgrade ? run.machineUpgradeRateBonus : 0)
                                                    }
                                                />
                                            }
                                        />
                                        <StatTile
                                            label="Net Raid"
                                            value={<SignedStat value={run.parts.reduce((sum, p) => sum + p.raidBonus, 0)} inverse />}
                                        />
                                    </Box>
                                )}

                                <Box>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                        <Typography variant="body2">Payout</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {run.currentMultiplier.toFixed(2)}x
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={Math.min(100, (run.currentMultiplier / run.peakMultiplier) * 100)}
                                        color="success"
                                        sx={{ height: 10, borderRadius: 999 }}
                                    />
                                </Box>

                                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                                    <StatTile label="Spent" value={formatCheddar(run.partsCost)} />
                                    <StatTile label="Payout Now" value={formatCheddar(payoutNow)} />
                                    <StatTile
                                        label="Net"
                                        value={`${netPayout >= 0 ? "+" : "-"}${formatCheddar(Math.abs(netPayout))}`}
                                        color={netPayout >= 0 ? "success.main" : "error.main"}
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
                    </CardContent>
                </Card>
            )}

            <PartPicker
                open={pickerOpen}
                parts={parts}
                machineUpgradeCost={machineUpgradeCost}
                isStarting={isStarting}
                onClose={() => setPickerOpen(false)}
                onStart={handleStart}
            />
        </GameWrapper>
    );
}
