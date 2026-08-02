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
import { SeedTier, useCasinoGarden } from "../../../../../hooks/casino/useCasinoGarden";
import { useCasinoMine } from "../../../../../hooks/casino/useCasinoMine";
import { bulkPrice, MineEquipmentItem, MineEquipmentList, SEED_EMOJI, TYPE_EMOJI, TYPE_LABEL } from "./shared";

const BUY_QUANTITIES = [1, 5, 10];

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
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                        {BUY_QUANTITIES.map((quantity) => (
                            <Button
                                key={quantity}
                                size="small"
                                variant="contained"
                                disabled={isBuyingFeed}
                                onClick={() => handleBuyFeed(item, quantity)}
                                sx={{ textTransform: "none", flexDirection: "column", lineHeight: 1.2, py: 0.75 }}
                            >
                                <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2, color: "inherit" }}>{quantity}x</Typography>
                                <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.85, lineHeight: 1.2, color: "inherit" }}>
                                    {formatCheddar(bulkPrice(item.price, quantity))}
                                </Typography>
                            </Button>
                        ))}
                    </Box>
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
    const { seedTiers, buySeed, isBuyingSeed } = useCasinoGarden();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuySeed = (tier: SeedTier, quantity: number) =>
        buySeed({ seedType: tier.key, quantity })
            .then(() => enqueueSnackbar(`Bought ${quantity}x ${tier.label} seed${quantity === 1 ? "" : "s"}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    if (seedTiers.length === 0) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
                Buy seeds into your stock, then plant them from an empty Garden plot.
            </Typography>
            {Object.values(seedTiers).map((tier) => (
                <Box
                    key={tier.key}
                    sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                >
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
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                        {BUY_QUANTITIES.map((quantity) => (
                            <Button
                                key={quantity}
                                size="small"
                                variant="contained"
                                disabled={isBuyingSeed}
                                onClick={() => handleBuySeed(tier, quantity)}
                                sx={{ textTransform: "none", flexDirection: "column", lineHeight: 1.2, py: 0.75 }}
                            >
                                <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2, color: "inherit" }}>{quantity}x</Typography>
                                <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.85, lineHeight: 1.2, color: "inherit" }}>
                                    {formatCheddar(bulkPrice(tier.cost, quantity))}
                                </Typography>
                            </Button>
                        ))}
                    </Box>
                </Box>
            ))}
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
