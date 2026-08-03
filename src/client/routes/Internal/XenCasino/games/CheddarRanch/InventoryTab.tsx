import { useState } from "react";
import {
    Box,
    Button,
    CardActionArea,
    Chip,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    Tab,
    Tabs,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SellIcon from "@mui/icons-material/Sell";
import { useSnackbar } from "notistack";
import { formatCheddar } from "../../utils/currency";
import { RanchTonicRecipe, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";
import { MineEquipmentItem, useCasinoMine } from "../../../../../hooks/casino/useCasinoMine";
import { ITEM_EMOJI, MINE_EQUIPMENT_ROWS, PROTECTION_ITEM_ROWS, STAT_ICON } from "./shared";

function ItemsPanel() {
    const { items, sellItem, isSellingItem } = useCasinoRanch();
    const { state: mineState, sellEquipment, isSellingEquipment } = useCasinoMine();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedEquipment, setSelectedEquipment] = useState<MineEquipmentItem | null>(null);
    const selectedItem = items.find((i) => i.key === selectedKey) ?? null;

    const equipmentOwned: Record<MineEquipmentItem, number> = mineState
        ? { ladder: mineState.ladderCount, explosive: mineState.explosiveCount, support: mineState.supportCount, flare: mineState.flareCount }
        : { ladder: 0, explosive: 0, support: 0, flare: 0 };
    const ownedEquipment = MINE_EQUIPMENT_ROWS.filter((row) => equipmentOwned[row.key] > 0);
    const selectedRow = ownedEquipment.find((row) => row.key === selectedEquipment) ?? null;

    function itemIcon(key: string) {
        const row = PROTECTION_ITEM_ROWS.find((r) => r.key === key);
        return row ? row.icon : (ITEM_EMOJI[key] ?? "📦");
    }

    function itemColor(key: string): string {
        const row = PROTECTION_ITEM_ROWS.find((r) => r.key === key);
        return row ? `${row.color}.main` : "text.primary";
    }

    const handleSell = () => {
        if (!selectedItem) {
            return;
        }
        sellItem(selectedItem.key)
            .then((r) => {
                enqueueSnackbar(`Sold ${r.quantity}x ${selectedItem.label} for ${formatCheddar(r.totalValue)} cheddar.`, { variant: "success" });
                setSelectedKey(null);
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to sell", { variant: "error" }));
    };

    const handleSellEquipment = () => {
        if (!selectedRow || !mineState) {
            return;
        }
        const count = equipmentOwned[selectedRow.key];
        const totalValue = mineState.prices[selectedRow.key].sellValue * count;
        sellEquipment({ item: selectedRow.key, quantity: count })
            .then(() => {
                enqueueSnackbar(`Sold ${count}x ${selectedRow.label} for ${formatCheddar(totalValue)} cheddar.`, { variant: "success" });
                setSelectedEquipment(null);
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to sell", { variant: "error" }));
    };

    if (items.length === 0 && ownedEquipment.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 2 }}>
                No items yet - collect from a creature in the Barn, dig ore in the Mines, or harvest the Garden.
            </Typography>
        );
    }

    return (
        <>
            {items.length > 0 && (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                    {items.map((item) => (
                        <CardActionArea
                            key={item.key}
                            onClick={() => setSelectedKey(item.key)}
                            sx={{
                                position: "relative",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 0.5,
                                p: 2,
                                borderRadius: 2,
                                border: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            <Chip
                                size="small"
                                label={`x${item.quantity}`}
                                sx={{ position: "absolute", top: 6, right: 6, height: 20, fontSize: 11, fontWeight: 700 }}
                            />
                            <Box sx={{ fontSize: 36, lineHeight: 1, color: itemColor(item.key) }}>{itemIcon(item.key)}</Box>
                            <Typography variant="caption" sx={{ textAlign: "center", fontWeight: 600 }}>
                                {item.label}
                            </Typography>
                        </CardActionArea>
                    ))}
                </Box>
            )}

            {ownedEquipment.length > 0 && (
                <>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: items.length > 0 ? 2 : 0, mb: 1 }}>
                        Mine Equipment
                    </Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                        {ownedEquipment.map((row) => (
                            <CardActionArea
                                key={row.key}
                                onClick={() => setSelectedEquipment(row.key)}
                                sx={{
                                    position: "relative",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 0.5,
                                    p: 2,
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: "divider",
                                }}
                            >
                                <Chip
                                    size="small"
                                    label={`x${equipmentOwned[row.key]}`}
                                    sx={{ position: "absolute", top: 6, right: 6, height: 20, fontSize: 11, fontWeight: 700 }}
                                />
                                <Box sx={{ fontSize: 36, color: `${row.color}.main`, display: "flex" }}>{row.icon}</Box>
                                <Typography variant="caption" sx={{ textAlign: "center", fontWeight: 600 }}>
                                    {row.label}
                                </Typography>
                            </CardActionArea>
                        ))}
                    </Box>
                </>
            )}

            <Dialog open={!!selectedItem} onClose={() => setSelectedKey(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Item Details
                    <IconButton onClick={() => setSelectedKey(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                {selectedItem && (
                    <DialogContent sx={{ pb: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{ fontSize: 48, lineHeight: 1, color: "text.primary" }}>{itemIcon(selectedItem.key)}</Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {selectedItem.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                            {selectedItem.description}
                        </Typography>
                        <Typography variant="body2">
                            You own {selectedItem.quantity} - worth {formatCheddar(selectedItem.sellValue)} each
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1, width: "100%", mt: 1 }}>
                            <Button variant="contained" fullWidth startIcon={<SellIcon />} disabled={isSellingItem} onClick={handleSell}>
                                Sell All ({formatCheddar(selectedItem.quantity * selectedItem.sellValue)})
                            </Button>
                        </Box>
                    </DialogContent>
                )}
            </Dialog>

            <Dialog open={!!selectedRow} onClose={() => setSelectedEquipment(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Item Details
                    <IconButton onClick={() => setSelectedEquipment(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                {selectedRow && mineState && (
                    <DialogContent sx={{ pb: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{ fontSize: 48, color: `${selectedRow.color}.main`, display: "flex" }}>{selectedRow.icon}</Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {selectedRow.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                            {selectedRow.desc}
                        </Typography>
                        <Typography variant="body2">
                            You own {equipmentOwned[selectedRow.key]} - worth {formatCheddar(mineState.prices[selectedRow.key].sellValue)} each
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1, width: "100%", mt: 1 }}>
                            <Button variant="contained" fullWidth startIcon={<SellIcon />} disabled={isSellingEquipment} onClick={handleSellEquipment}>
                                Sell All ({formatCheddar(mineState.prices[selectedRow.key].sellValue * equipmentOwned[selectedRow.key])})
                            </Button>
                        </Box>
                    </DialogContent>
                )}
            </Dialog>
        </>
    );
}

function CraftingPanel() {
    const { tonicRecipes, shopItems, craftTonic, isCraftingTonic } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleCraft = (recipe: RanchTonicRecipe) =>
        craftTonic(recipe.statKey)
            .then((r) => enqueueSnackbar(r.message, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to craft", { variant: "error" }));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
                Combine owned materials into a Tonic - free, no cheddar needed.
            </Typography>
            {tonicRecipes.map((recipe) => {
                const shopItem = shopItems.find((i) => i.key === recipe.tonicKey);
                if (!shopItem) {
                    return null;
                }
                const craftable = recipe.recipes.some((r) => r.owned >= r.quantity);
                return (
                    <Box
                        key={recipe.tonicKey}
                        sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {STAT_ICON[recipe.statKey]}
                            <Box sx={{ flexGrow: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {shopItem.label} (x{shopItem.quantity})
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {shopItem.description}
                                </Typography>
                            </Box>
                        </Box>
                        <Button
                            size="small"
                            variant="contained"
                            fullWidth
                            disabled={isCraftingTonic || !craftable}
                            onClick={() => handleCraft(recipe)}
                            sx={{ textTransform: "none" }}
                        >
                            Craft (free)
                        </Button>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                            <Typography variant="caption" color="text.secondary">
                                Craft from:
                            </Typography>
                            {recipe.recipes.map((r) => (
                                <Typography key={r.materialKey} variant="caption" color="text.secondary">
                                    {r.quantity}x {r.materialLabel} - you own {r.owned}
                                </Typography>
                            ))}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}

export default function InventoryTab() {
    const [tab, setTab] = useState(0);

    return (
        <Box>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 40, "& .MuiTab-root": { minHeight: 40 } }}>
                <Tab label="Items" />
                <Tab label="Crafting" />
            </Tabs>
            {tab === 0 && <ItemsPanel />}
            {tab === 1 && <CraftingPanel />}
        </Box>
    );
}
