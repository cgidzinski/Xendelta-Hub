import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Typography } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DiamondIcon from "@mui/icons-material/Diamond";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import PersonPinIcon from "@mui/icons-material/PersonPin";
import FlareIcon from "@mui/icons-material/Flare";
import { useSnackbar } from "notistack";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import { formatCheddar } from "../../utils/currency";
import { useCasinoMine } from "../../../../../hooks/casino/useCasinoMine";

const GRID_COLS = 9;
const GRID_ROWS_BELOW_PLAYER = 4;
const CELL_SIZE = 40;

export default function Mine() {
    const { state, isLoading, isError, error, refetch, dig, isDigging, buyEquipment, isBuying, useFlare, isFlaring } = useCasinoMine();
    const { enqueueSnackbar } = useSnackbar();

    const handleDig = (direction: "down" | "left" | "right") =>
        dig(direction)
            .then((r) => {
                if (r.outcome === "ore") {
                    enqueueSnackbar(
                        `${r.usedExplosive ? "Blasted through and struck" : "Struck"} ore! +${formatCheddar(r.payout)} cheddar`,
                        { variant: "success" }
                    );
                } else if (r.outcome === "cave_in") {
                    enqueueSnackbar("Cave-in! You lost your remaining digs for today.", { variant: "error" });
                } else if (r.usedExplosive) {
                    enqueueSnackbar("Blasted through with an explosive - no ore this time.", { variant: "info" });
                }
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to dig", { variant: "error" }));

    const handleBuy = (item: "ladder" | "torch" | "explosive") =>
        buyEquipment(item).catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    const handleFlare = () => useFlare().catch((e) => enqueueSnackbar(e.message || "Failed to use flare", { variant: "error" }));

    const oddsSections: OddsSection[] = state
        ? [
              {
                  title: "Equipment",
                  rows: [
                      { label: "Ladders", payout: `${formatCheddar(state.prices.ladder.cost)} for ${state.prices.ladder.amount}` },
                      { label: "Torch Fuel", payout: `${formatCheddar(state.prices.torch.cost)} for ${state.prices.torch.amount}` },
                      { label: "Explosive", payout: `${formatCheddar(state.prices.explosive.cost)} - one extra dig past today's cap, single-use` },
                      { label: "Flare", payout: `${formatCheddar(state.prices.flare.cost)} - one wider scouting pass (radius ${state.prices.flare.radius}), single-use` },
                  ],
                  footnote: "Digging down consumes a ladder and enters a riskier depth band. Digging sideways needs no ladder and stays at the current depth's risk level. There's no permanent pickaxe or torch level to grind - Explosives and Flares are single-use boosts bought fresh each time.",
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

    const { position, revealedTiles, digsToday, dailyDigCap, ladderCount, torchFuel, explosiveCount } = state;

    const minX = position.x - Math.floor(GRID_COLS / 2);
    const maxDepthRow = Math.max(position.y + GRID_ROWS_BELOW_PLAYER, 6);

    const tileAt = (x: number, y: number) => revealedTiles.find((t) => t.x === x && t.y === y);

    const digsRemaining = Math.max(0, dailyDigCap - digsToday);
    const canDig = digsRemaining > 0 || explosiveCount > 0;

    return (
        <GameWrapper
            title="Chip Mine"
            howToPlay="Dig down (consumes a ladder, riskier the deeper you go) or sideways (no ladder needed, risk stays at your current depth) for a chance at ore. A limited number of digs reset daily. Every tile you've dug stays visible forever. As you move, your torch also scouts nearby undug tiles and shows whether they glint with ore - one unit of fuel per newly scouted tile - so you can see what's coming before you commit to a direction. Cave-in risk is never shown in advance. There's no permanent pickaxe or torch level to grind - once you're out of digs for the day, a single-use Explosive blasts through for one more; a single-use Flare buys one wider scouting pass around where you're standing. Both are bought fresh each time."
            oddsSections={oddsSections}
        >
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mt: 2, mb: 1 }}>
                <Chip label={`Digs today: ${digsRemaining}/${dailyDigCap}`} color={digsRemaining > 0 ? "primary" : "error"} />
                <Chip label={`Ladders: ${ladderCount}`} variant="outlined" />
                <Chip label={`Torch fuel: ${torchFuel}`} variant="outlined" color={torchFuel > 0 ? "default" : "warning"} />
                <Chip label={`Explosives: ${explosiveCount}`} variant="outlined" color={explosiveCount > 0 ? "warning" : "default"} />
                <Chip label={`Depth: ${position.y}`} variant="outlined" />
            </Box>

            <Card variant="outlined" sx={{ bgcolor: "#0a0a0f", overflow: "hidden" }}>
                <CardContent sx={{ p: 2 }}>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL_SIZE}px)`,
                            gridAutoRows: `${CELL_SIZE}px`,
                            gap: "2px",
                            justifyContent: "center",
                            mx: "auto",
                            width: "fit-content",
                        }}
                    >
                        {Array.from({ length: maxDepthRow + 1 }).map((_, y) =>
                            Array.from({ length: GRID_COLS }).map((_, col) => {
                                const x = minX + col;
                                const isPlayer = x === position.x && y === position.y;
                                const tile = tileAt(x, y);
                                const isShaftEntrance = x === 0 && y === 0;
                                const known = !!tile || isShaftEntrance || isPlayer;

                                // "collapsed" = cave-in marker. "scouted" = torch preview, not yet
                                // dug (dashed border, dim ore glint if hasOre - never a hazard icon,
                                // cave-ins aren't previewable). "mined" = actually dug and resolved,
                                // plain background regardless of whether it had ore.
                                let bgcolor = "#050507";
                                if (tile?.status === "collapsed") {
                                    bgcolor = "error.dark";
                                } else if (tile?.status === "scouted") {
                                    bgcolor = "info.dark";
                                } else if (tile?.status === "mined" || (known && !tile)) {
                                    bgcolor = "grey.900";
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
                                            borderColor: known ? "grey.700" : "#050507",
                                            position: "relative",
                                        }}
                                    >
                                        {isPlayer && <PersonPinIcon sx={{ color: "info.light", fontSize: 26, position: "absolute" }} />}
                                        {!isPlayer && tile?.status === "collapsed" && <WhatshotIcon sx={{ color: "error.main", fontSize: 20 }} />}
                                        {!isPlayer && tile?.status === "scouted" && tile.hasOre && (
                                            <DiamondIcon sx={{ color: "warning.light", fontSize: 18, opacity: 0.6 }} />
                                        )}
                                    </Box>
                                );
                            })
                        )}
                    </Box>
                </CardContent>
            </Card>

            <Box sx={{ display: "flex", justifyContent: "center", gap: 1.5, mt: 2 }}>
                <Button
                    variant="contained"
                    startIcon={<ArrowBackIcon />}
                    disabled={isDigging || !canDig}
                    onClick={() => handleDig("left")}
                >
                    Left
                </Button>
                <Button
                    variant="contained"
                    color="warning"
                    startIcon={<ArrowDownwardIcon />}
                    disabled={isDigging || !canDig || ladderCount === 0}
                    onClick={() => handleDig("down")}
                >
                    Down
                </Button>
                <Button
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    disabled={isDigging || !canDig}
                    onClick={() => handleDig("right")}
                >
                    Right
                </Button>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "center", mt: 3 }}>
                <Button variant="outlined" disabled={isBuying} onClick={() => handleBuy("ladder")}>
                    Buy Ladders ({formatCheddar(state.prices.ladder.cost)})
                </Button>
                <Button variant="outlined" disabled={isBuying} onClick={() => handleBuy("torch")}>
                    Buy Torch Fuel ({formatCheddar(state.prices.torch.cost)})
                </Button>
                <Button variant="outlined" color="warning" disabled={isBuying} onClick={() => handleBuy("explosive")}>
                    Buy Explosive ({formatCheddar(state.prices.explosive.cost)})
                </Button>
                <Button variant="outlined" startIcon={<FlareIcon />} disabled={isFlaring} onClick={handleFlare}>
                    Use Flare ({formatCheddar(state.prices.flare.cost)})
                </Button>
            </Box>
        </GameWrapper>
    );
}
