import { useState } from "react";
import {
    Box,
    Button,
    LinearProgress,
    Tab,
    Tabs,
    Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { formatCheddar } from "../../utils/currency";
import { RanchFeedItem, RanchShopItem, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";
import { ProtectionItem, useCasinoGarden } from "../../../../../hooks/casino/useCasinoGarden";
import { useCasinoMine } from "../../../../../hooks/casino/useCasinoMine";
import { BulkQuantityButtons, MineEquipmentItem, MineEquipmentList, PROTECTION_ITEM_ROWS, ProtectionShopList, SeedShopList, TYPE_EMOJI, TYPE_LABEL } from "./shared";

function FeedPanel() {
    const { feedItems, buyFeed, isBuyingFeed } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuyFeed = (item: RanchFeedItem, quantity: number) =>
        buyFeed({ type: item.type, quantity })
            .then(() => enqueueSnackbar(`Bought ${quantity}x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    if (feedItems.length === 0) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {feedItems.map((item) => (
                <Box
                    key={item.key}
                    sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ fontSize: 24 }}>{TYPE_EMOJI[item.type]}</Typography>
                        <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {item.label} (x{item.quantity})
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {formatCheddar(item.price)} each
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                Feeds {TYPE_LABEL[item.type]} creatures
                            </Typography>
                        </Box>
                    </Box>
                    <BulkQuantityButtons unitCost={item.price} color="primary" disabled={isBuyingFeed} onBuy={(quantity) => handleBuyFeed(item, quantity)} />
                </Box>
            ))}
        </Box>
    );
}

function TonicsPanel() {
    const { tonicRecipes, shopItems, buyShopItem, isBuyingShopItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuyShopItem = (item: RanchShopItem) =>
        buyShopItem(item.key)
            .then(() => enqueueSnackbar(`Bought 1x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
                Buy a Tonic outright, or craft one for free from owned materials in Inventory.
            </Typography>
            {tonicRecipes.map((recipe) => {
                const shopItem = shopItems.find((i) => i.key === recipe.tonicKey);
                if (!shopItem) {
                    return null;
                }
                return (
                    <Box
                        key={recipe.tonicKey}
                        sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                    >
                        <Box>
                            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {shopItem.label} (x{shopItem.quantity})
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                {shopItem.description}
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            variant="contained"
                            fullWidth
                            disabled={isBuyingShopItem}
                            onClick={() => handleBuyShopItem(shopItem)}
                            sx={{ textTransform: "none" }}
                        >
                            Buy ({formatCheddar(shopItem.price)})
                        </Button>
                    </Box>
                );
            })}
        </Box>
    );
}

function GardenPanel() {
    const { seedTiers, buySeed, isBuyingSeed, protectionItems, buyProtection, isBuyingProtection } = useCasinoGarden();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuySeed = (seedType: string, quantity: number) => {
        const tier = seedTiers.find((t) => t.key === seedType);
        buySeed({ seedType, quantity })
            .then(() => enqueueSnackbar(`Bought ${quantity}x ${tier?.label ?? "seed"}${quantity === 1 ? "" : "s"}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    };

    const handleBuyProtection = (item: ProtectionItem["key"], quantity: number) => {
        const label = PROTECTION_ITEM_ROWS.find((r) => r.key === item)?.label ?? item;
        buyProtection({ item, quantity })
            .then(() => enqueueSnackbar(`Bought ${quantity}x ${label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    };

    if (seedTiers.length === 0) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
                Seeds - buy into your stock, then plant them from an empty Garden plot.
            </Typography>
            <SeedShopList seedTiers={seedTiers} mode="bulk" onBuy={handleBuySeed} isBuying={isBuyingSeed} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Crop protection - buy into your stock, then use them on a growing plot.
            </Typography>
            <ProtectionShopList protectionItems={protectionItems} mode="bulk" onBuy={handleBuyProtection} isBuying={isBuyingProtection} />
        </Box>
    );
}

function MineEquipmentPanel() {
    const { state, buyEquipment, isBuying } = useCasinoMine();
    const { enqueueSnackbar } = useSnackbar();

    if (!state) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    const handleBuy = (item: MineEquipmentItem, quantity: number) =>
        buyEquipment({ item, quantity }).catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
                Stock up before heading into the Mines - 5x/10x get a bulk discount. Use owned Flares from inside the Mine itself.
            </Typography>
            <MineEquipmentList
                prices={state.prices}
                owned={{ ladder: state.ladderCount, explosive: state.explosiveCount, support: state.supportCount, flare: state.flareCount }}
                mode="bulk"
                onBuy={handleBuy}
                isBuying={isBuying}
            />
        </Box>
    );
}

export default function ShopTab() {
    const [tab, setTab] = useState(0);

    return (
        <Box>
            <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ mb: 2, minHeight: 40, "& .MuiTab-root": { minHeight: 40 } }}
            >
                <Tab label="Feed" />
                <Tab label="Buy Tonics" />
                <Tab label="Garden" />
                <Tab label="Mine Equipment" />
            </Tabs>
            {tab === 0 && <FeedPanel />}
            {tab === 1 && <TonicsPanel />}
            {tab === 2 && <GardenPanel />}
            {tab === 3 && <MineEquipmentPanel />}
        </Box>
    );
}
