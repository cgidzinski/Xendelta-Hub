import { ReactNode, useEffect, useState } from "react";
import {
    Box,
    Button,
    CardActionArea,
    Chip,
    LinearProgress,
    Typography,
} from "@mui/material";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SpeedIcon from "@mui/icons-material/Speed";
import BatteryChargingFullIcon from "@mui/icons-material/BatteryChargingFull";
import BoltIcon from "@mui/icons-material/Bolt";
import PsychologyIcon from "@mui/icons-material/Psychology";
import CasinoIcon from "@mui/icons-material/Casino";
import FavoriteIcon from "@mui/icons-material/Favorite";
import StairsIcon from "@mui/icons-material/Stairs";
import ShieldIcon from "@mui/icons-material/Shield";
import FlareIcon from "@mui/icons-material/Flare";
import { formatCheddar } from "../../utils/currency";
import { RanchCreature, RanchStats, RanchType } from "../../../../../hooks/casino/useCasinoRanch";
import { SeedTier } from "../../../../../hooks/casino/useCasinoGarden";

export const COURSE_TICKET_KEY = "course-ticket";
export const HARDENED_FEED_KEY = "hardened-feed";
export const FORFEIT_INSURANCE_KEY = "forfeit-insurance";
export const TYPE_SWAP_SERUM_KEY = "type-swap-serum";
export const DECAY_SHIELD_KEY = "decay-shield";

// Race fields are always 5 racers (see casinoRanch.ts), so place is always 1-5 - a flat
// lookup is simpler than general ordinal-suffix logic no other place in the game needs.
const PLACE_ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" };
export function ordinal(place: number): string {
    return PLACE_ORDINAL[place] ?? `${place}th`;
}

// Mirrors feedUnitsRequired in casinoRanch.ts - display-only (the server is the real
// authority on what a feed action actually consumes), so the Feed button can show the cost
// before the player taps it.
export function feedUnitsRequired(level: number): number {
    return Math.floor((level - 1) / 10) + 1;
}

export const TYPE_EMOJI: Record<RanchType, string> = { land: "🌾", sea: "🌊", air: "🪽" };
export const TYPE_LABEL: Record<RanchType, string> = { land: "Land", sea: "Sea", air: "Air" };

// Shared between the Garden game itself and the Store's Garden (buy seeds) tab, so both
// surfaces render the same icon per seed type without drifting.
export const SEED_EMOJI: Record<string, string> = {
    sprout: "🌱",
    clover: "🍀",
    nightshade: "🍄",
    "golden-vine": "🍇",
};

export const ITEM_EMOJI: Record<string, string> = {
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
    copper: "🟤",
    silver: "⚪",
    gold: "🟡",
    emerald: "🟢",
    ruby: "🔴",
    diamond: "💎",
};

// Ticks once a second for as long as `targetMs` is non-null, same pattern as Garden's
// watering cooldown badge - reads Date.now() fresh on every tick rather than trusting a
// slower page-level clock.
export function useCountdown(targetMs: number | null): number {
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

export function feedReadyAt(creature: RanchCreature, cooldownMs: number): number | null {
    return creature.lastFedAt ? new Date(creature.lastFedAt).getTime() + cooldownMs : null;
}

export function formatCountdown(msRemaining: number): string {
    if (msRemaining <= 0) {
        return "Ready";
    }
    const totalSeconds = Math.ceil(msRemaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function totalStats(stats: RanchCreature["stats"]): number {
    return stats.speed + stats.stamina + stats.power + stats.intelligence + stats.luck + stats.charm;
}

// Rarity-ordered so a glance at the color tells you roughly how good a creature is, same
// idea as Mine's TIER_COLOR for gems.
export const TIER_COLOR: Record<string, string> = {
    common: "#b0b0b0",
    uncommon: "#4caf50",
    rare: "#2196f3",
    epic: "#9c27b0",
    legendary: "#ffd700",
};

export const SPECIES_EMOJI: Record<string, string> = {
    common: "🐹",
    uncommon: "🐐",
    rare: "🦌",
    epic: "🦅",
    legendary: "🐉",
};

export const STAT_ORDER: (keyof RanchStats)[] = ["speed", "stamina", "power", "intelligence", "luck", "charm"];

export const STAT_ICON: Record<keyof RanchStats, ReactNode> = {
    speed: <SpeedIcon sx={{ fontSize: 15 }} />,
    stamina: <BatteryChargingFullIcon sx={{ fontSize: 15 }} />,
    power: <BoltIcon sx={{ fontSize: 15 }} />,
    intelligence: <PsychologyIcon sx={{ fontSize: 15 }} />,
    luck: <CasinoIcon sx={{ fontSize: 15 }} />,
    charm: <FavoriteIcon sx={{ fontSize: 15 }} />,
};

export function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
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
export function StatsGrid({ stats }: { stats: RanchCreature["stats"] }) {
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
export function RaceRecord({ wins, losses }: { wins: number; losses: number }) {
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
export function ActionButton({ icon, label, description, color = "primary", disabled, onClick }: ActionButtonProps) {
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

export type MineEquipmentItem = "ladder" | "explosive" | "support" | "flare";

export interface MineEquipmentPrices {
    ladder: { cost: number; sellValue: number };
    explosive: { cost: number; sellValue: number };
    support: { cost: number; sellValue: number };
    flare: { cost: number; sellValue: number };
}

// Mirrors bulkPrice in casinoRanch.ts - 5% off at 5x, 10% off at 10x, otherwise full price.
// Duplicated here for display only (so a bulk button can show what it'll actually charge
// before tapping) - the server is still the sole source of truth for what's charged.
export function bulkPrice(unitCost: number, quantity: number): number {
    const discount = quantity >= 10 ? 0.1 : quantity >= 5 ? 0.05 : 0;
    return Math.round(unitCost * quantity * (1 - discount));
}

interface BulkQuantityButtonsProps {
    unitCost: number;
    color: "primary" | "warning" | "error" | "success" | "info";
    disabled: boolean;
    onBuy: (quantity: number) => void;
}

// The 1x/5x/10x bulk-buy grid, shared by Feed, Garden (Store's Garden tab), and Mine
// Equipment's bulk buttons - shows the struck-through full price plus a "-5%/-10%" badge
// whenever bulkPrice actually discounts the quantity, so the saving reads at a glance
// instead of just landing on a smaller number.
export function BulkQuantityButtons({ unitCost, color, disabled, onBuy }: BulkQuantityButtonsProps) {
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
            {[1, 5, 10].map((qty) => {
                const pctOff = qty >= 10 ? 10 : qty >= 5 ? 5 : 0;
                const discounted = bulkPrice(unitCost, qty);
                return (
                    <Button
                        key={qty}
                        size="small"
                        variant="contained"
                        color={color}
                        disabled={disabled}
                        onClick={() => onBuy(qty)}
                        sx={{ textTransform: "none", flexDirection: "column", lineHeight: 1.2, py: 0.75 }}
                    >
                        <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2, color: "inherit" }}>
                            {qty}x{pctOff > 0 && ` −${pctOff}%`}
                        </Typography>
                        {pctOff > 0 && (
                            <Typography sx={{ fontSize: 9, lineHeight: 1.2, textDecoration: "line-through", opacity: 0.6, color: "inherit" }}>
                                {formatCheddar(unitCost * qty)}
                            </Typography>
                        )}
                        <Typography sx={{ fontSize: 10, lineHeight: 1.2, opacity: 0.85, color: "inherit" }}>
                            {formatCheddar(discounted)}
                        </Typography>
                    </Button>
                );
            })}
        </Box>
    );
}

interface SeedShopListProps {
    seedTiers: SeedTier[];
    // "bulk" (Store's Garden tab): 1x/5x/10x buy buttons showing the discounted total.
    // "single" (GardenGame's own Shop dialog): one Buy-1 button per seed - buying there is
    // deliberately single-quantity, same split as MineEquipmentList below.
    mode: "bulk" | "single";
    onBuy: (seedType: string, quantity: number) => void;
    isBuying: boolean;
}

// Seed rows - shared by GardenGame's in-game Shop dialog and the Store's Garden tab, so
// both read the same live prices/owned counts and never drift.
export function SeedShopList({ seedTiers, mode, onBuy, isBuying }: SeedShopListProps) {
    return (
        <>
            {seedTiers.map((tier) => (
                <Box key={tier.key} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ fontSize: 24 }}>{SEED_EMOJI[tier.key] ?? "🌾"}</Typography>
                        <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {tier.label} (x{tier.owned})
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {formatCheddar(tier.cost)} each
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                {tier.waterAmount} growth stages to mature
                            </Typography>
                        </Box>
                    </Box>
                    {mode === "bulk" ? (
                        <BulkQuantityButtons unitCost={tier.cost} color="primary" disabled={isBuying} onBuy={(qty) => onBuy(tier.key, qty)} />
                    ) : (
                        <Button size="small" variant="contained" fullWidth disabled={isBuying} onClick={() => onBuy(tier.key, 1)} sx={{ textTransform: "none" }}>
                            Buy 1 ({formatCheddar(tier.cost)})
                        </Button>
                    )}
                </Box>
            ))}
        </>
    );
}

const MINE_EQUIPMENT_ROWS: { key: MineEquipmentItem; icon: ReactNode; label: string; color: "warning" | "error" | "success" | "info"; desc: string }[] = [
    { key: "ladder", icon: <StairsIcon />, label: "Ladder", color: "warning", desc: "Dig up or down into new territory" },
    { key: "explosive", icon: <BoltIcon />, label: "Explosive", color: "error", desc: "Clears heavy stone blocking your path" },
    { key: "support", icon: <ShieldIcon />, label: "Support", color: "success", desc: "Blocks your next cave-in" },
    { key: "flare", icon: <FlareIcon />, label: "Flare", color: "info", desc: "Reveals a 3×3 area around you" },
];

interface MineEquipmentListProps {
    prices: MineEquipmentPrices;
    owned: Record<MineEquipmentItem, number>;
    // "bulk" (Store's Mine Equipment tab): 1x/5x/10x buy buttons showing the discounted
    // total. "single" (MineGame's own Shop dialog): one Buy-1 button, plus Sell-1/Sell-All
    // once any are owned - buying there is deliberately single-quantity, though selling can
    // clear a whole stack at once.
    mode: "bulk" | "single";
    onBuy: (item: MineEquipmentItem, quantity: number) => void;
    isBuying: boolean;
    onSell?: (item: MineEquipmentItem, quantity: number) => void;
    isSelling?: boolean;
}

// Ladder/Explosive/Support/Flare rows - shared by MineGame's in-game Mine Shop dialog and
// the Store's Mine Equipment tab, so both read the same live prices/colors and never drift.
export function MineEquipmentList({ prices, owned, mode, onBuy, isBuying, onSell, isSelling }: MineEquipmentListProps) {
    return (
        <>
            {MINE_EQUIPMENT_ROWS.map((item) => {
                const price = prices[item.key].cost;
                const sellValue = prices[item.key].sellValue;
                const ownedCount = owned[item.key];
                return (
                    <Box key={item.key} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box sx={{ color: `${item.color}.main` }}>{item.icon}</Box>
                            <Box sx={{ flexGrow: 1 }}>
                                <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.label} (x{ownedCount})</Typography>
                                    <Typography variant="caption" color="text.secondary">{formatCheddar(price)} each</Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary">{item.desc}</Typography>
                            </Box>
                        </Box>
                        {mode === "bulk" ? (
                            <BulkQuantityButtons unitCost={price} color={item.color} disabled={isBuying} onBuy={(qty) => onBuy(item.key, qty)} />
                        ) : (
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                <Box sx={{ display: "flex", gap: 1 }}>
                                    <Button size="small" variant="contained" color={item.color} fullWidth
                                        disabled={isBuying} onClick={() => onBuy(item.key, 1)} sx={{ textTransform: "none" }}>
                                        Buy 1
                                    </Button>
                                    {onSell && ownedCount > 0 && (
                                        <Button size="small" variant="outlined" color={item.color} fullWidth
                                            disabled={!!isSelling} onClick={() => onSell(item.key, 1)} sx={{ textTransform: "none" }}>
                                            Sell 1 ({formatCheddar(sellValue)})
                                        </Button>
                                    )}
                                </Box>
                                {onSell && ownedCount > 1 && (
                                    <Button size="small" variant="text" color={item.color} fullWidth
                                        disabled={!!isSelling} onClick={() => onSell(item.key, ownedCount)} sx={{ textTransform: "none" }}>
                                        Sell All {ownedCount} ({formatCheddar(sellValue * ownedCount)})
                                    </Button>
                                )}
                            </Box>
                        )}
                    </Box>
                );
            })}
        </>
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
export function RanchCard({ creature, feedCooldownMs, selected, onClick }: RanchCardProps) {
    const cooldownRemaining = useCountdown(feedReadyAt(creature, feedCooldownMs));
    const canFeed = cooldownRemaining <= 0;
    const feedProgress = canFeed ? 100 : Math.max(0, 100 - (cooldownRemaining / feedCooldownMs) * 100);

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
            <LinearProgress
                variant="determinate"
                value={feedProgress}
                color={canFeed ? "info" : "warning"}
                sx={{ width: "100%", height: 4, borderRadius: 999 }}
            />
            <Typography variant="body2" sx={{ fontWeight: 700, textAlign: "center" }}>
                {creature.name}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
                <Chip
                    size="small"
                    label={creature.rarityTier}
                    sx={{ textTransform: "capitalize", fontWeight: 700, bgcolor: TIER_COLOR[creature.rarityTier], color: "#000" }}
                />
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
export function HatchTile({ hatchPrice, onClick }: { hatchPrice: number; onClick: () => void }) {
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

// How long (seconds) the leader's lane takes to finish, plus a stagger per place further
// back - a purely cosmetic mapping from the server-decided finishing order (RaceResultEntry
// .place) onto a CSS transition duration, so lanes visibly cross the line in the exact
// order the server already computed.
export const BASE_RACE_DURATION_S = 1.8;
export const RACE_STAGGER_S = 0.45;
export function durationForPlace(place: number): number {
    return BASE_RACE_DURATION_S + (place - 1) * RACE_STAGGER_S;
}

export const SPIN_EMOJI = ["🐹", "🐐", "🦌", "🦅", "🐉", "🦦", "🦊", "🐺", "🐏"];
