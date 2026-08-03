import { useState } from "react";
import {
    Box,
    Card,
    CardActionArea,
    CardContent,
    LinearProgress,
    Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { RanchShopItem, RanchType, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";
import { ProtectionItem, useCasinoGarden } from "../../../../../hooks/casino/useCasinoGarden";
import { useCasinoMine } from "../../../../../hooks/casino/useCasinoMine";
import { FeedShopList, MineEquipmentItem, MineEquipmentList, PROTECTION_ITEM_ROWS, ProtectionShopList, RanchShopItemList, SeedShopList, ShopModal, STAT_ICON } from "./shared";

function FeedPanel() {
    const { feedItems, buyFeed, isBuyingFeed } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuyFeed = (type: RanchType, quantity: number) => {
        const item = feedItems.find((f) => f.type === type);
        buyFeed({ type, quantity })
            .then(() => enqueueSnackbar(`Bought ${quantity}x ${item?.label ?? "feed"}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    };

    if (feedItems.length === 0) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    return <FeedShopList feedItems={feedItems} mode="bulk" onBuy={handleBuyFeed} isBuying={isBuyingFeed} />;
}

function TonicsPanel() {
    const { tonicRecipes, shopItems, buyShopItem, isBuyingShopItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const tonicItems = tonicRecipes
        .map((recipe) => shopItems.find((i) => i.key === recipe.tonicKey))
        .filter((item): item is RanchShopItem => !!item);

    const handleBuyShopItem = (key: string) => {
        const item = shopItems.find((i) => i.key === key);
        if (!item) {
            return;
        }
        buyShopItem(item.key)
            .then(() => enqueueSnackbar(`Bought 1x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
                Buy a Tonic outright, or craft one for free from owned materials in Inventory.
            </Typography>
            <RanchShopItemList
                items={tonicItems}
                icon={(item) => STAT_ICON[item.key.replace("tonic-", "") as keyof typeof STAT_ICON] ?? null}
                onBuy={handleBuyShopItem}
                isBuying={isBuyingShopItem}
            />
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

type ShopCategory = "feed" | "tonics" | "garden" | "mine";

const SHOP_CATEGORIES: { key: ShopCategory; label: string; emoji: string; description: string }[] = [
    { key: "feed", label: "Feed", emoji: "🍖", description: "Stock up for your Ranch creatures" },
    { key: "tonics", label: "Buy Tonics", emoji: "🧪", description: "Guaranteed, targeted stat boosts" },
    { key: "garden", label: "Garden", emoji: "🌱", description: "Seeds & crop protection" },
    { key: "mine", label: "Mine Equipment", emoji: "⛏️", description: "Ladders, explosives, supports, flares" },
];

function ShopCategoryTile({ emoji, label, description, onClick }: { emoji: string; label: string; description: string; onClick: () => void }) {
    return (
        <Card sx={{ height: "100%", transition: "transform 0.2s, box-shadow 0.2s", "&:hover": { transform: "translateY(-4px)", boxShadow: 6 } }}>
            <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
                <CardContent sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75, p: 1.75, "&:last-child": { pb: 1.75 }, height: "100%" }}>
                    <Typography sx={{ fontSize: 32, lineHeight: 1 }}>{emoji}</Typography>
                    <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, textAlign: "center" }}>
                        {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                        {description}
                    </Typography>
                </CardContent>
            </CardActionArea>
        </Card>
    );
}

export default function ShopTab() {
    const [openCategory, setOpenCategory] = useState<ShopCategory | null>(null);

    return (
        <Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 1 }}>
                {SHOP_CATEGORIES.map((cat) => (
                    <ShopCategoryTile
                        key={cat.key}
                        emoji={cat.emoji}
                        label={cat.label}
                        description={cat.description}
                        onClick={() => setOpenCategory(cat.key)}
                    />
                ))}
            </Box>

            <ShopModal open={openCategory === "feed"} onClose={() => setOpenCategory(null)} title="Feed">
                <FeedPanel />
            </ShopModal>
            <ShopModal open={openCategory === "tonics"} onClose={() => setOpenCategory(null)} title="Buy Tonics">
                <TonicsPanel />
            </ShopModal>
            <ShopModal open={openCategory === "garden"} onClose={() => setOpenCategory(null)} title="Garden">
                <GardenPanel />
            </ShopModal>
            <ShopModal open={openCategory === "mine"} onClose={() => setOpenCategory(null)} title="Mine Equipment">
                <MineEquipmentPanel />
            </ShopModal>
        </Box>
    );
}
