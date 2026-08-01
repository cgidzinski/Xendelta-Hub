import {
    Box,
    Button,
    LinearProgress,
    Typography,
} from "@mui/material";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import { useSnackbar } from "notistack";
import { formatCheddar } from "../../utils/currency";
import { RanchFeedItem, RanchShopItem, RanchTonicRecipe, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";
import { STAT_ICON, TYPE_EMOJI, TYPE_LABEL } from "./shared";

const FEED_BUY_QUANTITIES = [1, 5, 10];

export default function ShopTab() {
    const {
        feedItems,
        shopItems,
        tonicRecipes,
        buyFeed,
        isBuyingFeed,
        buyShopItem,
        isBuyingShopItem,
        craftTonic,
        isCraftingTonic,
    } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();

    const handleBuyFeed = (item: RanchFeedItem, quantity: number) =>
        buyFeed({ type: item.type, quantity })
            .then(() => enqueueSnackbar(`Bought ${quantity}x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    const handleBuyShopItem = (item: RanchShopItem) =>
        buyShopItem(item.key)
            .then(() => enqueueSnackbar(`Bought 1x ${item.label}.`, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to buy", { variant: "error" }));

    const handleCraft = (recipe: RanchTonicRecipe) =>
        craftTonic(recipe.statKey)
            .then((r) => enqueueSnackbar(r.message, { variant: "success" }))
            .catch((e) => enqueueSnackbar(e.message || "Failed to craft", { variant: "error" }));

    const otherItems = shopItems.filter((i) => !i.key.startsWith("tonic-"));

    if (feedItems.length === 0) {
        return <LinearProgress sx={{ mt: 2 }} />;
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {feedItems.map((item) => (
                    <Box
                        key={item.key}
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            p: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1.5,
                        }}
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
                            {FEED_BUY_QUANTITIES.map((quantity) => (
                                <Button
                                    key={quantity}
                                    size="small"
                                    variant="contained"
                                    startIcon={<RestaurantIcon />}
                                    disabled={isBuyingFeed}
                                    onClick={() => handleBuyFeed(item, quantity)}
                                    sx={{ textTransform: "none" }}
                                >
                                    {quantity}x
                                </Button>
                            ))}
                        </Box>
                    </Box>
                ))}
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Tonics
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
                            <Box sx={{ display: "flex", gap: 1 }}>
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
                                <Button
                                    size="small"
                                    variant="outlined"
                                    fullWidth
                                    disabled={isCraftingTonic || !craftable}
                                    onClick={() => handleCraft(recipe)}
                                    sx={{ textTransform: "none" }}
                                >
                                    Craft (free)
                                </Button>
                            </Box>
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

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Other Items
                </Typography>
                {otherItems.map((item) => (
                    <Box
                        key={item.key}
                        sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                    >
                        <Box>
                            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {item.label} (x{item.quantity})
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {formatCheddar(item.price)} each
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                {item.description}
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            variant="contained"
                            disabled={isBuyingShopItem}
                            onClick={() => handleBuyShopItem(item)}
                            sx={{ textTransform: "none" }}
                        >
                            Buy ({formatCheddar(item.price)})
                        </Button>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
