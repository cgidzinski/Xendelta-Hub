import { ReactNode, useState } from "react";
import { Alert, Box, Button, Card, Chip, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, Stack, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DiamondIcon from "@mui/icons-material/Diamond";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import PersonPinIcon from "@mui/icons-material/PersonPin";
import FlareIcon from "@mui/icons-material/Flare";
import StairsIcon from "@mui/icons-material/Stairs";
import BoltIcon from "@mui/icons-material/Bolt";
import ShieldIcon from "@mui/icons-material/Shield";
import TerrainIcon from "@mui/icons-material/Terrain";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { MineTile, useCasinoMine } from "../../../../../hooks/casino/useCasinoMine";

const VIEW_RADIUS = 3; // tiles visible in every direction around the player
const GRID_COLS = VIEW_RADIUS * 2 + 1; // fixed viewport width, keeps the page from growing
const CELL_SIZE = 40;
const DEPTH_LABEL_COL = 26; // px - fixed-width side gutter for the depth ruler numbers

const ROCK_COLOR = "#3e3229"; // unexplored - reads as solid stone, not a void
const STONE_BLOCKED_COLOR = "#2a2420"; // known heavy stone - darker/harder than plain rock
const TUNNEL_COLOR = "grey.900"; // cleared, walkable

// Rarity-ordered so a glance at the color tells you roughly how good a find is, both in
// the "scouted" preview glint and the permanent marker left on a successfully mined tile.
const TIER_COLOR: Record<string, string> = {
    copper: "#b87333",
    silver: "#c0c0c0",
    gold: "#ffd700",
    emerald: "#50c878",
    ruby: "#e0115f",
    diamond: "#b9f2ff",
};

// Same tier ordering as TIER_COLOR - just for a bit of extra color in the find toast.
const TIER_EMOJI: Record<string, string> = {
    copper: "🟤",
    silver: "⚪",
    gold: "🟡",
    emerald: "🟢",
    ruby: "🔴",
    diamond: "💎",
};

// A brief flash on the just-dug cell so a discovery reads immediately, not just via the
// toast - same "inline @keyframes in sx" idiom as SpinmaniaGrid's cell-enter animation.
const DIG_FLASH_MS = 600;
const DIG_FLASH_SX: Record<string, object> = {
    ore: {
        animation: `mineDigFlashOre ${DIG_FLASH_MS}ms ease-out`,
        "@keyframes mineDigFlashOre": {
            "0%": { boxShadow: "0 0 0 4px rgba(255,215,0,0.95)", transform: "scale(1.15)" },
            "100%": { boxShadow: "0 0 0 0px rgba(255,215,0,0)", transform: "scale(1)" },
        },
    },
    cave_in: {
        animation: `mineDigFlashCaveIn ${DIG_FLASH_MS}ms ease-out`,
        "@keyframes mineDigFlashCaveIn": {
            "0%": { boxShadow: "0 0 0 4px rgba(244,67,54,0.9)", transform: "translateX(0)" },
            "25%": { transform: "translateX(-3px)" },
            "50%": { transform: "translateX(3px)" },
            "75%": { transform: "translateX(-2px)" },
            "100%": { boxShadow: "0 0 0 0px rgba(244,67,54,0)", transform: "translateX(0)" },
        },
    },
    neutral: {
        animation: `mineDigFlashNeutral ${DIG_FLASH_MS}ms ease-out`,
        "@keyframes mineDigFlashNeutral": {
            "0%": { boxShadow: "0 0 0 4px rgba(255,255,255,0.5)" },
            "100%": { boxShadow: "0 0 0 0px rgba(255,255,255,0)" },
        },
    },
};

// A single icon + one-line-of-context stat row, same pattern as Garden/Printer.
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

interface ActionButtonProps {
    icon: ReactNode;
    label: string;
    description: ReactNode;
    color?: "primary" | "warning" | "error";
    disabled?: boolean;
    onClick: () => void;
}

// A full-width bordered button with a bold label (name + price) on top and a
// plain-language description underneath - same shape as Garden/Printer's ActionButton,
// stays visible-but-disabled (not hidden) when unusable.
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

export default function MineGame() {
    const {
        state,
        isLoading,
        isError,
        error,
        refetch,
        dig,
        isDigging,
        buyEquipment,
        isBuying,
        useFlare,
        isFlaring,
    } = useCasinoMine();
    const { enqueueSnackbar } = useSnackbar();
    const [flashTile, setFlashTile] = useState<{ x: number; y: number; kind: string } | null>(null);
    const [shopOpen, setShopOpen] = useState(false);

    const handleBuy = (item: "ladder" | "explosive" | "support") =>
        buyEquipment(item).catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    const handleFlare = () =>
        useFlare()
            .then(() => enqueueSnackbar("Flare burst - scouted the area around you.", { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to use flare", { variant: "error" }));

    const oddsSections: OddsSection[] = state
        ? [
            {
                title: "Equipment",
                rows: [
                    { label: "Dig Fee", payout: `${formatCheddar(state.prices.dig.cost)} per real dig - free to move through tunnels you've already cleared` },
                    { label: "Ladder", payout: `${formatCheddar(state.prices.ladder.cost)} each` },
                    { label: "Explosive", payout: `${formatCheddar(state.prices.explosive.cost)} - single-use, blasts through the daily cap, a missing ladder, and/or heavy stone` },
                    { label: "Support", payout: `${formatCheddar(state.prices.support.cost)} - single-use shield against your next cave-in, stays armed until it actually blocks one` },
                    { label: "Flare", payout: `${formatCheddar(state.prices.flare.cost)} - reveals a 3x3 area around you, single-use` },
                ],
                footnote: "Moving through tunnels you've already cleared is always free. Every real dig into new territory costs the flat dig fee regardless of what's found; going down also consumes a ladder and enters a riskier depth band, while sideways needs no ladder and stays at the current depth's risk level.",
            },
            {
                title: "Gem Tiers",
                rows: state.oreTiers.map((t) => ({
                    label: `${t.label} (from depth ${t.minDepth})`,
                    payout: `${t.valueMultiplier}x value`,
                })),
                footnote: "The deeper you dig, the more tiers are in play, and the rarer/richer ones start competing for the roll - so depth raises both your odds of a good find and its value.",
            },
        ]
        : [];

    if (isError) {
        return (
            <GameWrapper title="Chip Mine" howToPlay="Loading..." oddsSections={[]}>
                <Alert
                    severity="error"
                    sx={{ mt: 4 }}
                    action={
                        <Button color="inherit" size="small" onClick={() => refetch()}>
                            Retry
                        </Button>
                    }
                >
                    {error?.message || "Failed to load the mine"}
                </Alert>
            </GameWrapper>
        );
    }

    if (isLoading || !state) {
        return (
            <GameWrapper title="Chip Mine" howToPlay="Loading..." oddsSections={[]}>
                <LinearProgress sx={{ mt: 4 }} />
            </GameWrapper>
        );
    }

    const { position, revealedTiles, actionsToday, dailyDigCap, ladderCount, explosiveCount, supportCount } = state;

    const minX = position.x - VIEW_RADIUS;
    const minY = Math.max(0, position.y - VIEW_RADIUS); // clamp at the surface, never show y < 0
    const maxY = minY + VIEW_RADIUS * 2; // always exactly GRID_COLS rows tall

    const tileAt = (x: number, y: number) => revealedTiles.find((t) => t.x === x && t.y === y);

    const digsRemaining = Math.max(0, dailyDigCap - actionsToday);
    const canAffordCapBlock = digsRemaining > 0;
    const canAffordLadderBlock = ladderCount > 0 || explosiveCount > 0;

    const targetFor = (direction: "up" | "down" | "left" | "right") => ({
        x: position.x + (direction === "left" ? -1 : direction === "right" ? 1 : 0),
        y: position.y + (direction === "down" ? 1 : direction === "up" ? -1 : 0),
    });

    const handleDig = (direction: "up" | "down" | "left" | "right") => {
        const { x: dugX, y: dugY } = targetFor(direction);
        const tile = tileAt(dugX, dugY);
        const useExplosive = tile?.status === "blocked" || (!canAffordCapBlock) || (direction === "up" && tile?.status !== "mined" && (ladderCount === 0));

        dig({ direction, useExplosive })
            .then((r) => {
                if (r.outcome !== "move") {
                    setFlashTile({ x: dugX, y: dugY, kind: r.outcome });
                    setTimeout(() => setFlashTile((cur) => (cur?.x === dugX && cur?.y === dugY ? null : cur)), DIG_FLASH_MS);
                }
                if (r.outcome === "ore") {
                    const tierLabel = r.state.oreTiers.find((t) => t.key === r.oreTier)?.label ?? "ore";
                    const emoji = (r.oreTier && TIER_EMOJI[r.oreTier]) || "💎";
                    enqueueSnackbar(`Found ${emoji} ${tierLabel}`, { variant: "success" });
                } else if (r.outcome === "cave_in") {
                    enqueueSnackbar("Cave-in! No more actions today.", { variant: "error" });
                } else if (r.usedExplosive) {
                    enqueueSnackbar("Cleared with Explosive.", { variant: "info" });
                }
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to dig", { variant: "error" }));
    };

    function canGo(direction: "up" | "down" | "left" | "right"): boolean {
        const { x, y } = targetFor(direction);
        if (y < 0) {
            return false;
        }
        const t = tileAt(x, y);
        if (t?.status === "mined") {
            return true; // always free to walk back through cleared tunnels
        }
        if (direction === "up" || direction === "down") {
            if (ladderCount === 0 && explosiveCount === 0) return false;
        }
        if (t?.status === "blocked" && explosiveCount === 0) {
            return false; // known heavy stone, nothing to clear it with
        }
        if (t?.status === "collapsed") {
            return false; // rubble from a past cave-in - permanent, nothing clears it
        }
        const laddersOk = (direction === "down" || direction === "up") ? canAffordLadderBlock : true;
        return canAffordCapBlock && laddersOk;
    }

    function dirStyle(direction: "up" | "down" | "left" | "right"): { bg: string; hover: string; icon: ReactNode } {
        const t = tileAt(targetFor(direction).x, targetFor(direction).y);
        if (t?.status === "mined") {
            return { bg: "primary.main", hover: "primary.dark", icon: direction === "up" ? <ArrowUpwardIcon /> : direction === "down" ? <ArrowDownwardIcon /> : direction === "left" ? <ArrowBackIcon /> : <ArrowForwardIcon /> };
        }
        if (digsRemaining <= 0) {
            return { bg: "grey.600", hover: "grey.600", icon: direction === "up" ? <ArrowUpwardIcon /> : direction === "down" ? <ArrowDownwardIcon /> : direction === "left" ? <ArrowBackIcon /> : <ArrowForwardIcon /> };
        }
        if (t?.status === "blocked") {
            return { bg: "error.main", hover: "error.dark", icon: <BoltIcon /> };
        }
        if (direction === "up" || direction === "down") {
            return { bg: "warning.main", hover: "warning.dark", icon: <StairsIcon /> };
        }
        return { bg: "primary.main", hover: "primary.dark", icon: direction === "left" ? <ArrowBackIcon /> : <ArrowForwardIcon /> };
    }

    return (
        <GameWrapper
            title="Chip Mine"
            howToPlay="Moving through tunnels you've already cleared is always free - no digs spent, no cheddar, no risk, walk it as much as you like (you can even head back Up). Only pushing into new, undug territory is a real dig: it spends one of today's limited digs and costs a flat cheddar fee regardless of what's found, and going down also needs a ladder. There's no way to preview a tile in advance except a Flare, which reveals a 3x3 area around you (whether a tile holds a gem, and its tier, or whether it's heavy stone) - otherwise you're digging blind, same as always for cave-in risk. Heavy stone randomly blocks some tiles and needs an Explosive to clear. A cave-in leaves rubble behind that permanently blocks that tunnel - nothing clears it, you'll have to dig around it. A Support is a single-use shield against your next cave-in - it stays armed through any number of safe digs, only used up the moment it actually blocks one. An Explosive is a universal bypass: spend one to blast through today's dig limit, a missing ladder, and/or heavy stone, any combination at once. The deeper you go, the better the gems get - both the chance of a good find and its value rise with depth. You get one free ladder every day. If you ever want a clean slate, you can wipe your whole map and start over from the surface for a fee - your equipment carries over."
            oddsSections={oddsSections}
        >
            <Card variant="outlined" sx={{ bgcolor: "#0a0a0f", overflow: "hidden", mt: 2, display: "flex", justifyContent: "center" }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: `${DEPTH_LABEL_COL}px repeat(${GRID_COLS}, ${CELL_SIZE}px) ${DEPTH_LABEL_COL}px`,
                        gridAutoRows: `${CELL_SIZE}px`,
                        gap: "2px",
                        p: { xs: 1, sm: 2 },
                    }}
                >
                    {Array.from({ length: maxY - minY + 1 }).flatMap((_, i) => {
                        const y = minY + i;
                        const cells = Array.from({ length: GRID_COLS }).map((_, col) => {
                            const x = minX + col;
                            const isPlayer = x === position.x && y === position.y;
                            const tile: MineTile | undefined = tileAt(x, y);
                            const isShaftEntrance = x === 0 && y === 0;
                            const known = !!tile || isShaftEntrance || isPlayer;
                            const isFlashing = flashTile?.x === x && flashTile?.y === y;

                            // "collapsed" = cave-in marker. "blocked" = known heavy stone,
                            // not yet cleared. "scouted" = a Flare preview, not yet dug
                            // (dashed border, dim gem-tier glint if there's a gem - never
                            // a hazard icon, cave-ins aren't previewable). "mined" =
                            // actually dug and resolved, plain tunnel background
                            // regardless of whether it held a gem (the small corner
                            // marker below shows that instead).
                            let bgcolor: string = ROCK_COLOR;
                            if (tile?.status === "collapsed") {
                                bgcolor = "error.dark";
                            } else if (tile?.status === "blocked") {
                                bgcolor = STONE_BLOCKED_COLOR;
                            } else if (tile?.status === "scouted") {
                                bgcolor = "warning.dark";
                            } else if (tile?.status === "mined" || (known && !tile)) {
                                bgcolor = TUNNEL_COLOR;
                            }

                            return (
                                <Box
                                    key={`${x}-${y}`}
                                    sx={{
                                        width: CELL_SIZE,
                                        height: CELL_SIZE,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderRadius: 0.5,
                                        bgcolor,
                                        border: tile?.status === "scouted" ? "1px dashed" : "1px solid",
                                        borderColor: tile?.status === "blocked" ? "warning.dark" : known ? "grey.700" : ROCK_COLOR,
                                        position: "relative",
                                        ...(isFlashing ? DIG_FLASH_SX[flashTile!.kind] ?? DIG_FLASH_SX.neutral : {}),
                                    }}
                                >
                                    {isPlayer && <PersonPinIcon sx={{ color: "info.light", fontSize: 26, position: "absolute" }} />}
                                    {!isPlayer && tile?.status === "collapsed" && <WhatshotIcon sx={{ color: "error.main", fontSize: 20 }} />}
                                    {!isPlayer && tile?.status === "blocked" && <TerrainIcon sx={{ color: "warning.light", fontSize: 20 }} />}
                                    {!isPlayer && tile?.status === "scouted" && tile.oreTier && (
                                        <DiamondIcon sx={{ color: TIER_COLOR[tile.oreTier] ?? "warning.light", fontSize: 18, opacity: 0.6 }} />
                                    )}
                                    {tile?.status === "mined" && tile.oreTier && (
                                        <DiamondIcon
                                            sx={{ color: TIER_COLOR[tile.oreTier] ?? "warning.main", fontSize: 12, position: "absolute", bottom: 3, right: 3 }}
                                        />
                                    )}
                                </Box>
                            );
                        });

                        // A ruler number in the side gutters every 10 rows so the shaft's
                        // depth reads at a glance, not just via the "Depth" stat tile.
                        // Every row emits both gutter cells (empty except on a milestone
                        // row) so each row has the same item count - a row with fewer
                        // items than the rest would throw off CSS grid's auto-placement
                        // and misalign every row after it.
                        const isMilestone = y > 0 && y % 10 === 0;
                        const labelSx = { display: "flex", alignItems: "center", justifyContent: "center" };
                        return [
                            <Box key={`depth-label-left-${y}`} sx={labelSx}>
                                {isMilestone && <Typography variant="caption" color="text.secondary">{y}</Typography>}
                            </Box>,
                            ...cells,
                            <Box key={`depth-label-right-${y}`} sx={labelSx}>
                                {isMilestone && <Typography variant="caption" color="text.secondary">{y}</Typography>}
                            </Box>,
                        ];
                    })}
                </Box>
            </Card>

            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mt: 2, gap: 1.5 }}>
                {/* Stats row */}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                        <StatTile label="Actions" value={`${digsRemaining}/${dailyDigCap}`} color={digsRemaining === 0 ? "error.main" : digsRemaining <= 2 ? "warning.main" : undefined} />
                        <Button variant="outlined" size="small" onClick={() => setShopOpen(true)} sx={{ textTransform: "none", minWidth: 60 }}>
                            Shop
                        </Button>
                    </Box>
                    <StatTile label="Ladders" value={ladderCount} color={ladderCount > 0 ? undefined : "warning.main"} />
                    <StatTile label="Explosives" value={explosiveCount} color={explosiveCount > 0 ? "error.main" : undefined} />
                    <StatTile label="Supports" value={supportCount} color={supportCount > 0 ? "info.main" : undefined} />
                </Box>

                {/* D-pad */}
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                    {(() => {
                        const s = dirStyle("up"); return (
                            <IconButton disabled={isDigging || !canGo("up")} onClick={() => handleDig("up")} aria-label="Up"
                                sx={{ bgcolor: s.bg, color: "white", "&:hover": { bgcolor: s.hover }, "&.Mui-disabled": { bgcolor: "action.disabledBackground" } }}>
                                {s.icon}
                            </IconButton>
                        );
                    })()}
                    <Box sx={{ display: "flex", gap: 1 }}>
                        {["left", "down", "right"].map(d => {
                            const s = dirStyle(d as "left" | "down" | "right");
                            return (
                                <IconButton key={d} disabled={isDigging || !canGo(d as any)} onClick={() => handleDig(d as any)} aria-label={d}
                                    sx={{ bgcolor: s.bg, color: "white", "&:hover": { bgcolor: s.hover }, "&.Mui-disabled": { bgcolor: "action.disabledBackground" } }}>
                                    {s.icon}
                                </IconButton>
                            );
                        })}
                    </Box>
                </Box>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2, maxWidth: 480, mx: "auto" }}>
                <ActionButton
                    icon={<StairsIcon />}
                    label={`Buy Ladder (${formatCheddar(state.prices.ladder.cost)})`}
                    description="Dig up or down into new territory. Free moves through cleared tunnels never need one."
                    disabled={isBuying}
                    onClick={() => handleBuy("ladder")}
                />
                <ActionButton
                    icon={<BoltIcon />}
                    label={`Buy Explosive (${formatCheddar(state.prices.explosive.cost)})`}
                    description="Clears heavy stone blocking your path. Single-use per blast."
                    color="warning"
                    disabled={isBuying}
                    onClick={() => handleBuy("explosive")}
                />
                <ActionButton
                    icon={<ShieldIcon />}
                    label={`Buy Support (${formatCheddar(state.prices.support.cost)})`}
                    description="Blocks your next cave-in. Stays armed until actually hit."
                    color="primary"
                    disabled={isBuying}
                    onClick={() => handleBuy("support")}
                />
                <ActionButton
                    icon={<FlareIcon />}
                    label={`Use Flare (${formatCheddar(state.prices.flare.cost)})`}
                    description="Reveals a 3×3 area — gem tiers and heavy stone."
                    disabled={isFlaring}
                    onClick={handleFlare}
                />

            </Box>

            <Dialog open={shopOpen} onClose={() => setShopOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Mine Shop
                    <IconButton onClick={() => setShopOpen(false)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                    {[
                        { icon: <StairsIcon />, label: "Ladder", price: state.prices.ladder.cost, desc: "Dig up or down into new territory", color: undefined as "warning" | undefined, buy: "ladder" as const },
                        { icon: <BoltIcon />, label: "Explosive", price: state.prices.explosive.cost, desc: "Clears heavy stone blocking your path", color: "warning" as const, buy: "explosive" as const },
                        { icon: <ShieldIcon />, label: "Support", price: state.prices.support.cost, desc: "Blocks your next cave-in", color: undefined as "primary" | undefined, buy: "support" as const },
                        { icon: <FlareIcon />, label: "Flare", price: state.prices.flare.cost, desc: "Reveals a 3×3 area around you", color: undefined, buy: null },
                    ].map((item) => (
                        <Box key={item.label} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Box sx={{ color: item.color === "warning" ? "warning.main" : "text.secondary" }}>{item.icon}</Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.label}</Typography>
                                        <Typography variant="caption" color="text.secondary">{formatCheddar(item.price)} each</Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">{item.desc}</Typography>
                                </Box>
                            </Box>
                            {item.buy ? (
                                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                                    {[1, 5, 10].map((qty) => (
                                        <Button key={qty} size="small" variant="contained" color={item.color === "warning" ? "warning" : "primary"}
                                            disabled={isBuying} onClick={() => handleBuy(item.buy!)} sx={{ textTransform: "none" }}>
                                            {qty}x
                                        </Button>
                                    ))}
                                </Box>
                            ) : (
                                <Button size="small" variant="contained" fullWidth disabled={isFlaring} onClick={() => { handleFlare(); setShopOpen(false); }} sx={{ textTransform: "none" }}>
                                    Use ({formatCheddar(item.price)})
                                </Button>
                            )}
                        </Box>
                    ))}
                </DialogContent>
            </Dialog>

            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 3, justifyContent: "center" }}>
                <StatLine icon={<PersonPinIcon sx={{ color: "info.light" }} />}>You</StatLine>
                <StatLine icon={<Box sx={{ width: 12, height: 12, bgcolor: ROCK_COLOR, border: "1px solid", borderColor: "grey.800", borderRadius: 0.5 }} />}>
                    Rock (unexplored)
                </StatLine>
                <StatLine icon={<Box sx={{ width: 12, height: 12, bgcolor: TUNNEL_COLOR, border: "1px solid", borderColor: "grey.700", borderRadius: 0.5 }} />}>
                    Tunnel (mined)
                </StatLine>
                <StatLine icon={<Box sx={{ width: 12, height: 12, bgcolor: "warning.dark", border: "1px dashed", borderColor: "grey.700", borderRadius: 0.5 }} />}>
                    Scouted (previewed by Flare, not yet dug)
                </StatLine>
                <StatLine icon={<TerrainIcon sx={{ color: "warning.light" }} />}>Heavy stone</StatLine>
                <StatLine icon={<DiamondIcon sx={{ color: "warning.light", opacity: 0.6 }} />}>Gem glint (scouted tile has a gem)</StatLine>
                <StatLine icon={<WhatshotIcon sx={{ color: "error.main" }} />}>Cave-in</StatLine>
            </Stack>
        </GameWrapper>
    );
}
