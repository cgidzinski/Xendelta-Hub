/**
 * GardenGame - renders the Casino Garden inline within Cheddar Ranch.
 */
import { ReactNode, useEffect, useState } from "react";
import {
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
    List,
    ListItemButton,
    Stack,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import BugReportIcon from "@mui/icons-material/BugReport";
import ScienceIcon from "@mui/icons-material/Science";
import SpaIcon from "@mui/icons-material/Spa";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ShoppingBasketIcon from "@mui/icons-material/ShoppingBasket";
import SpeedIcon from "@mui/icons-material/Speed";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { GardenSquare, SeedTier, useCasinoGarden } from "../../../../../hooks/casino/useCasinoGarden";
import { SEED_EMOJI, SeedShopList } from "./shared";

// Ticks once a second for as long as `targetMs` is non-null, reading Date.now() fresh on
// every tick rather than trusting a slower page-level clock - this is what makes the
// watering cooldown badge/button actually count down instead of sitting on a stale minute
// bucket for up to a minute at a time. Returns the live ms remaining, floored at 0.
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

// null lastWateredAt means never watered - always immediately waterable, so there's no
// cooldown target to count down to. Uses the square's own waterCooldownMs (shorter than
// the page-level base once bonemeal has been bought for it), not a shared one.
function waterReadyAt(square: GardenSquare): number | null {
    return square.lastWateredAt ? new Date(square.lastWateredAt).getTime() + square.waterCooldownMs : null;
}

function formatCountdown(msRemaining: number): string {
    if (msRemaining <= 0) {
        return "Ready";
    }
    const totalSeconds = Math.ceil(msRemaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
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
            // Fully watered but still waiting out the final cooldown before it's ready -
            // see resolveGardenSquare in xenCasinoRanch.js.
            return square.waterCount >= square.waterAmount ? "Maturing..." : `${square.waterCount}/${square.waterAmount}`;
    }
}

const STATUS_COLOR: Record<GardenSquare["status"], "default" | "success" | "warning" | "error"> = {
    empty: "default",
    growing: "warning",
    ready: "success",
    dead: "error",
};

// A small round icon-only badge for the tile's bottom status row - no label text, just
// enough to signal "this is active" without competing for space with the countdown/
// vermin-count badges that do need a label.
function TileIconBadge({ icon }: { icon: ReactNode }) {
    return (
        <Box
            sx={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                bgcolor: "success.main",
                color: "success.contrastText",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {icon}
        </Box>
    );
}

interface GardenTileProps {
    square: GardenSquare;
    onOpen: (squareId: number) => void;
}

// The compact grid tile - a top row (watering badge and/or vermin badge), an emoji, a
// progress bar, a one-line status, and a bottom row of icon badges for any
// pesticide/fungicide/bonemeal currently active. Both badge rows are laid out in normal
// flex flow (not absolutely positioned) so they never overlap the emoji or each other,
// and reserve consistent space whether or not anything is active. Everything else (stats,
// protection/harvest actions, seed picker) lives in the modal that opens on tap (see
// SquareDetails below).
function GardenTile({ square, onOpen }: GardenTileProps) {
    const progress =
        square.status === "ready"
            ? 100
            : square.status === "growing" && square.waterAmount > 0
                ? Math.min(100, (square.waterCount / square.waterAmount) * 100)
                : 0;
    const needsWatering = square.status === "growing" && square.waterCount < square.waterAmount;
    const cooldownRemaining = useCountdown(needsWatering ? waterReadyAt(square) : null);
    const onCooldown = cooldownRemaining > 0;
    const hasVermin = square.verminHits > 0 && (square.status === "growing" || square.status === "ready");
    const hasPesticide = square.protection.pesticide && square.status === "growing";
    const hasFungicide = square.protection.fungicide && square.status === "growing";
    const hasBonemeal = square.protection.bonemeal && square.status === "growing";

    const hasStatusIcon = hasPesticide || hasFungicide || hasBonemeal;

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
            <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", minHeight: 24, gap: 0.5 }}>
                <Box>
                    {hasVermin && (
                        <Chip
                            size="small"
                            label={`🐀 ${square.verminHits}`}
                            color="warning"
                            sx={{ height: 20, fontSize: 11, fontWeight: 700, "& .MuiChip-label": { px: "6px" } }}
                        />
                    )}
                </Box>
                <Box>
                    {needsWatering && (
                        <Chip
                            size="small"
                            icon={<WaterDropIcon sx={{ fontSize: "14px !important" }} />}
                            label={onCooldown ? formatCountdown(cooldownRemaining) : "Ready"}
                            color={onCooldown ? "default" : "info"}
                            variant={onCooldown ? "outlined" : "filled"}
                            sx={{ height: 20, fontSize: 11, fontWeight: 700, "& .MuiChip-label": { px: "6px" } }}
                        />
                    )}
                </Box>
            </Box>
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
            {hasStatusIcon && (
                <Box sx={{ display: "flex", justifyContent: "center", gap: 0.5, minHeight: 20 }}>
                    {hasPesticide && <TileIconBadge icon={<BugReportIcon sx={{ fontSize: 13 }} />} />}
                    {hasFungicide && <TileIconBadge icon={<ScienceIcon sx={{ fontSize: 13 }} />} />}
                    {hasBonemeal && <TileIconBadge icon={<SpeedIcon sx={{ fontSize: 13 }} />} />}
                </Box>
            )}
        </CardActionArea>
    );
}

// A single icon + one-line-of-context stat row, used both in the seed picker and the
// growing/ready stat grid so every number in the modal reads the same way.
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

// A percent chance called out in red at the end of an ActionButton's description, so the
// number that actually matters (how likely the hazard is) stands out from the sentence
// explaining what the item does about it.
function ChancePercent({ value }: { value: number }) {
    return (
        <Typography component="span" variant="caption" sx={{ color: "error.main", fontWeight: 700 }}>
            {(value * 100).toFixed(0)}% chance
        </Typography>
    );
}

function StatTile({ label, value }: { label: string; value: ReactNode }) {
    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {value}
            </Typography>
        </Box>
    );
}

interface ActionButtonProps {
    icon: ReactNode;
    label: string;
    chance?: number;
    description: ReactNode;
    color?: "primary" | "success" | "error";
    variant?: "outlined" | "contained";
    disabled?: boolean;
    onClick: () => void;
}

// A full-width action button with a bold label (plus, for the hazard-blocking items, the
// percent chance right after the name and price) on top, and a plain-language explanation
// of what it does underneath - so the pesticide/fungicide/fertilizer/water buttons don't
// rely on the player already knowing the mechanics.
function ActionButton({ icon, label, chance, description, color = "primary", variant = "outlined", disabled, onClick }: ActionButtonProps) {
    return (
        <Button
            fullWidth
            variant={variant}
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
                    {chance !== undefined && (
                        <>
                            {" "}
                            <ChancePercent value={chance} />
                        </>
                    )}
                </Typography>
                <Typography
                    variant="caption"
                    sx={{ display: "block", lineHeight: 1.3, opacity: variant === "contained" ? 0.85 : 1 }}
                    color={variant === "contained" ? "inherit" : "text.secondary"}
                >
                    {description}
                </Typography>
            </Box>
        </Button>
    );
}

interface SeedOptionProps {
    tier: SeedTier;
    disabled: boolean;
    onSelect: () => void;
    onBuy: () => void;
    isBuying: boolean;
}

// One seed choice in the empty-plot picker - the whole row is a single action: plant from
// stock if you own any, or buy 1 if you don't. The "N owned" / "Buy {cost}" text is pure
// decor, not its own control - no nested button, so no greyed-out disabled look for the
// 0-owned case either. Only disabled while a plant/buy request is actually in flight.
function SeedOption({ tier, disabled, onSelect, onBuy, isBuying }: SeedOptionProps) {
    const owned = tier.owned > 0;
    return (
        <ListItemButton
            disabled={disabled || isBuying}
            onClick={owned ? onSelect : onBuy}
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
            <Avatar sx={{ bgcolor: "action.hover", fontSize: 22, width: 44, height: 44, flexShrink: 0 }}>
                {SEED_EMOJI[tier.key] || "🌾"}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, rowGap: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mr: "auto" }}>
                        {tier.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: owned ? "success.main" : "warning.main" }}>
                        {owned ? `${tier.owned} owned` : `Buy ${formatCheddar(tier.cost)}`}
                    </Typography>
                </Box>
                <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                    <StatLine icon={<AttachMoneyIcon />}>Seed value {formatCheddar(tier.cost)} - pays {multiplierRange(tier.baseMultiplier, tier.variance)}</StatLine>
                    <StatLine icon={<WaterDropIcon />}>{tier.waterAmount} growth stages needed</StatLine>
                    <StatLine icon={<WarningAmberIcon />}>
                        Vermin {(tier.verminChance * 100).toFixed(0)}% / Disease {(tier.diseaseChance * 100).toFixed(0)}% per check
                    </StatLine>
                </Stack>
            </Box>
        </ListItemButton>
    );
}

interface SquareDetailsProps {
    square: GardenSquare;
    onHarvested: () => void;
    onCleared: () => void;
    onOpenShop: () => void;
}

// Full stats + every action for the selected square - rendered inside the modal, adapting
// to status exactly like the old inline SquareCard body did.
function SquareDetails({ square, onHarvested, onCleared, onOpenShop }: SquareDetailsProps) {
    const {
        seedTiers,
        protectionCost,
        cleanupFee,
        plant,
        isPlanting,
        buySeed,
        isBuyingSeed,
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

    // The same cooldown-since-last-watering target doubles as "when can I water again" and
    // (once fully watered) "when does this flip to ready" - see resolveGardenSquare in
    // xenCasinoRanch.js, which waits out the same cooldown after the final watering too.
    const cooldownRemaining = useCountdown(waterReadyAt(square));
    const onCooldown = cooldownRemaining > 0;
    // Fully watered but still waiting out the final cooldown before it flips to "ready" -
    // see resolveGardenSquare in xenCasinoRanch.js. Nothing left to water at this point.
    const fullyWatered = square.waterCount >= square.waterAmount;
    // The last growth stage always has to be reached by an actual watering - fertilizer
    // can shorten everything before it, but never skip the final one (enforced again
    // server-side in XenCasinoRanch.protectGardenSquare).
    const lastStageRemaining = square.waterAmount - square.waterCount <= 1;

    const handlePlant = (seedType: string) =>
        plant({ squareId: square.squareId, seedType }).catch((e) => enqueueSnackbar(e.message || "Failed to plant", { variant: "error" }));
    const handleBuySeed = (seedType: string) =>
        buySeed({ seedType, quantity: 1 }).catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    const handleWater = () => water({ squareId: square.squareId }).catch((e) => enqueueSnackbar(e.message || "Failed to water", { variant: "error" }));
    const handleProtect = (item: "pesticide" | "fungicide" | "fertilizer" | "bonemeal") =>
        protect({ squareId: square.squareId, item }).catch((e) => enqueueSnackbar(e.message || "Failed to protect", { variant: "error" }));
    const handleHarvest = () =>
        harvest({ squareId: square.squareId })
            .then((r) => {
                const bonus = r.bonusSeedReturned ? ` A ${square.seedLabel} seed dropped back into your stock too!` : "";
                enqueueSnackbar(`Harvested ${r.item.quantity}x ${r.item.label}! Sell it from your Inventory.${bonus}`, { variant: "success" });
                onHarvested();
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to harvest", { variant: "error" }));
    const handleClear = () =>
        clear({ squareId: square.squareId })
            .then(() => onCleared())
            .catch((e) => enqueueSnackbar(e.message || "Failed to clear", { variant: "error" }));

    if (square.status === "empty") {
        return (
            <Box>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, mb: 2.5 }}>
                    <Avatar sx={{ width: 56, height: 56, fontSize: 28, bgcolor: "action.hover" }}>{EMPTY_EMOJI}</Avatar>
                    <Typography variant="body2" color="text.secondary">
                        Plant from your seed stock - buy more from the Store
                    </Typography>
                </Box>
                <List disablePadding>
                    {seedTiers.map((tier) => (
                        <SeedOption
                            key={tier.key}
                            tier={tier}
                            disabled={isPlanting}
                            onSelect={() => handlePlant(tier.key)}
                            onBuy={() => handleBuySeed(tier.key)}
                            isBuying={isBuyingSeed}
                        />
                    ))}
                </List>
            </Box>
        );
    }

    if (square.status === "dead") {
        return (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textAlign: "center", py: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                    <Button variant="outlined" size="small" onClick={onOpenShop} sx={{ textTransform: "none" }}>
                        Shop
                    </Button>
                </Box>
                <Avatar sx={{ width: 64, height: 64, fontSize: 34, bgcolor: "error.dark" }}>{DEAD_EMOJI}</Avatar>
                <Typography variant="body2" color="text.secondary">
                    This plot's crop died. Clean it up before you can replant.
                </Typography>
                <Button variant="outlined" color="error" startIcon={<DeleteSweepIcon />} disabled={isClearing} onClick={handleClear}>
                    Clear Plot (Fee: {formatCheddar(cleanupFee)})
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, py: 0.5 }}>
                <Avatar
                    sx={{
                        width: 64,
                        height: 64,
                        fontSize: 34,
                        bgcolor: square.status === "ready" ? "success.dark" : "action.hover",
                    }}
                >
                    {tileEmoji(square)}
                </Avatar>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {square.seedLabel}
                </Typography>
                <Chip label={square.status} size="small" color={STATUS_COLOR[square.status]} sx={{ textTransform: "capitalize" }} />
            </Box>

            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="outlined" size="small" onClick={onOpenShop} sx={{ textTransform: "none" }}>
                    Shop
                </Button>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                <StatTile label="Seed Value" value={formatCheddar(square.cost)} />
                <StatTile label="Payout" value={multiplierRange(square.baseMultiplier, square.variance)} />
            </Box>

            <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                        Growth
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {square.waterCount}/{square.waterAmount}
                    </Typography>
                </Box>
                <LinearProgress
                    variant="determinate"
                    value={square.waterAmount > 0 ? Math.min(100, (square.waterCount / square.waterAmount) * 100) : 0}
                    color={square.status === "ready" ? "success" : "warning"}
                    sx={{ height: 8, borderRadius: 999 }}
                />
                {square.status === "ready" && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Ready to harvest
                    </Typography>
                )}
            </Box>

            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {square.verminHits > 0 && (
                    <Chip
                        size="small"
                        label={`🐀 ${square.verminHits} growth stage${square.verminHits > 1 ? "s" : ""} lost to vermin`}
                        color="warning"
                    />
                )}
                {square.protection.pesticide && <Chip size="small" icon={<BugReportIcon />} label="Pesticide" color="success" />}
                {square.protection.fungicide && <Chip size="small" icon={<ScienceIcon />} label="Fungicide" color="success" />}
                {square.protection.fertilized && <Chip size="small" icon={<SpaIcon />} label="Fertilized" color="success" />}
                {square.protection.bonemeal && <Chip size="small" icon={<SpeedIcon />} label="Bonemeal (+25% growth rate)" color="success" />}
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {square.status === "growing" && !fullyWatered && (
                    <ActionButton
                        variant="contained"
                        icon={<WaterDropIcon />}
                        label="Water"
                        description={
                            onCooldown
                                ? `On cooldown - available again in ${formatCountdown(cooldownRemaining)}`
                                : "Advances this crop to its next growth stage"
                        }
                        disabled={isWatering || onCooldown}
                        onClick={handleWater}
                    />
                )}
                {fullyWatered && (
                    <ActionButton
                        variant="contained"
                        color="success"
                        icon={<ShoppingBasketIcon />}
                        label="Harvest"
                        description={square.status === "ready" ? "Harvest this crop" : `Maturing - ready in ${formatCountdown(cooldownRemaining)}`}
                        disabled={square.status !== "ready" || isHarvesting}
                        onClick={handleHarvest}
                    />
                )}
                {square.status === "growing" && (
                    <ActionButton
                        icon={<BugReportIcon />}
                        label={`Pesticide (${formatCheddar(protectionCost.pesticide)})`}
                        chance={square.protection.pesticide ? undefined : square.verminChance}
                        description={
                            square.protection.pesticide
                                ? "Already applied to this crop"
                                : "Shields against the next vermin (🐀)"
                        }
                        disabled={isProtecting || square.protection.pesticide}
                        onClick={() => handleProtect("pesticide")}
                    />
                )}
                {square.status === "growing" && (
                    <ActionButton
                        icon={<ScienceIcon />}
                        label={`Fungicide (${formatCheddar(protectionCost.fungicide)})`}
                        chance={square.protection.fungicide ? undefined : square.diseaseChance}
                        description={
                            square.protection.fungicide
                                ? "Already applied to this crop"
                                : "Shields against disease (🦠 — doubles decay)"
                        }
                        disabled={isProtecting || square.protection.fungicide}
                        onClick={() => handleProtect("fungicide")}
                    />
                )}
                {square.status === "growing" && (
                    <ActionButton
                        icon={<SpaIcon />}
                        label={`Fertilizer (${formatCheddar(protectionCost.fertilizer)})`}
                        description={
                            square.protection.fertilized
                                ? "Already applied to this crop"
                                : fullyWatered
                                    ? "Already fully watered - nothing left to fertilize"
                                    : lastStageRemaining
                                        ? "Can't be used on the final growth stage"
                                        : "Instantly clears one growth stage"
                        }
                        disabled={isProtecting || square.protection.fertilized || lastStageRemaining}
                        onClick={() => handleProtect("fertilizer")}
                    />
                )}
                {square.status === "growing" && (
                    <ActionButton
                        icon={<SpeedIcon />}
                        label={`Bonemeal (${formatCheddar(protectionCost.bonemeal)})`}
                        description={
                            square.protection.bonemeal
                                ? "Already applied to this crop"
                                : "Speeds up every watering cooldown on this crop from now on - 25% faster growth"
                        }
                        disabled={isProtecting || square.protection.bonemeal}
                        onClick={() => handleProtect("bonemeal")}
                    />
                )}
            </Box>
        </Box>
    );
}

export default function GardenGame() {
    const { squares, seedTiers, waterCooldownMs, neglectGraceMs, cleanupFee, isLoading, buySeed, isBuyingSeed } = useCasinoGarden();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedSquareId, setSelectedSquareId] = useState<number | null>(null);
    const [shopOpen, setShopOpen] = useState(false);

    const selectedSquare = squares.find((s) => s.squareId === selectedSquareId) ?? null;

    const handleBuySeed = (seedType: string) =>
        buySeed({ seedType, quantity: 1 }).catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    const oddsSections: OddsSection[] = [
        {
            title: "Seeds",
            rows: seedTiers.map((t) => ({
                label: `${t.label} (${formatCheddar(t.cost)}, ${t.waterAmount} growth stages)`,
                payout: `${multiplierRange(t.baseMultiplier, t.variance)} - vermin ${(t.verminChance * 100).toFixed(0)}% / disease ${(
                    t.diseaseChance * 100
                ).toFixed(0)}% per check`,
            })),
            footnote: `Seeds are bought into your stock from the Store's Garden tab, then planted here for free - no cheddar changes hands at plant time. Harvest yields produce for your Inventory - the quantity is cost x base multiplier, swung +/- the seed's variance by casino luck - and also has a 20% chance to return one seed of that type straight back to your stock. Each seed needs a set number of growth stages to mature - watering (on a ${formatDuration(
                waterCooldownMs
            )} cooldown per plot) advances one stage at a time. A vermin (🐀) hit sets a crop back a growth stage instead of hurting it outright. A plot left completely unwatered for ${formatDuration(
                neglectGraceMs
            )} starts losing one growth stage per midnight if it hasn't been watered in over 24 hours — a dead plot costs ${formatCheddar(
                cleanupFee
            )} to clean up before replanting. A diseased (🦠) plot loses two stages per midnight instead of one until cured with fungicide. Fertilizer instantly clears one growth stage still needed; bonemeal speeds up every watering cooldown on that crop by 25% from then on. Both are single-use per crop - buy them fresh on each new plant, they don't carry over.`,
        },
    ];

    return (
        <GameWrapper
            title="Casino Garden"
            howToPlay={`Buy seeds from the Store's Garden tab, then tap an empty plot to plant one from your stock - planting itself is free, since the seed was already paid for. Tap a growing or ready plot to water it or harvest it. Growth is what actually matters - each seed needs a set number of growth stages to mature, and watering is just what advances it to the next one, at most once every ${formatDuration(
                waterCooldownMs
            )} per plot. There's no rush: a plot only starts losing progress if it goes a full ${formatDuration(
                neglectGraceMs
            )} with zero watering, after which it loses one growth stage per midnight until it's rewatered or runs out and dies. Unprotected plots can also be struck by vermin (🐀 — adds one more required growth stage, shown as a counter on the plot) or disease (🦠 — doubles the daily decay rate until cured with fungicide) on any hazard check. Buy pesticide to shield against vermin, or fungicide to block and cure disease (each stays up through any number of misses and is only used up the moment it actually blocks a hit). Buy fertilizer to instantly clear one growth stage still needed, or bonemeal to speed up every watering cooldown on that crop by 25% from then on (shown as a badge on the plot). A dead plot costs ${formatCheddar(
                cleanupFee
            )} to clean up before you can replant it. Harvesting doesn't pay cheddar directly - it fills your Inventory with produce you sell later.`}
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

            <Dialog
                open={!!selectedSquare}
                onClose={() => setSelectedSquareId(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Plot {selectedSquareId !== null ? selectedSquareId + 1 : ""}
                    <IconButton onClick={() => setSelectedSquareId(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3 }}>
                    {selectedSquare && (
                        <SquareDetails
                            square={selectedSquare}
                            onHarvested={() => setSelectedSquareId(null)}
                            onCleared={() => setSelectedSquareId(null)}
                            onOpenShop={() => setShopOpen(true)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={shopOpen} onClose={() => setShopOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Garden Shop
                    <IconButton onClick={() => setShopOpen(false)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                        Buy seeds one at a time here. Bulk discounts (5x/10x) are in the Store.
                    </Typography>
                    <SeedShopList seedTiers={seedTiers} mode="single" onBuy={handleBuySeed} isBuying={isBuyingSeed} />
                </DialogContent>
            </Dialog>
        </GameWrapper>
    );
}
