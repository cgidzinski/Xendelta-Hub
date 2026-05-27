import { Box, Card, CardActionArea, CardActions, CardContent, CardMedia, Container, DialogActions, DialogContent, Typography, Button, Dialog, Grid, Chip, IconButton, Divider } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { PointsShopItem, usePointsShopItems } from "../../../hooks/user/usePoints";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useState } from "react";
import { PointsIcon } from "../../../components/icons/PointsIcon";

const CATEGORIES = ["All", "Roles", "Items", "Perks"];

export default function Shop() {
    const { pointsShopItems, isLoading, isError, error, buyPointsItemMutation, isBuyingPointsItem, buyPointsItemError } = usePointsShopItems();
    const { profile } = useUserProfile();
    const [showBuyModal, setShowBuyModal] = useState<boolean>(false);
    const [selectedItem, setSelectedItem] = useState<PointsShopItem | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>("All");

    if (isLoading) {
        return <LoadingSpinner />;
    }

    if (isError) {
        return <ErrorDisplay error={error} />;
    }

    const handleBuyItem = async (item: PointsShopItem) => {
        const result = await buyPointsItemMutation(item);
        if (result.status) {
            setShowBuyModal(false);
        }
    };

    const filteredItems = selectedCategory === "All"
        ? pointsShopItems
        : pointsShopItems.filter((_, index) => index % CATEGORIES.length === CATEGORIES.indexOf(selectedCategory));

    return (
        <Box>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                {/* Points Header */}
                <Box sx={{ mb: 4, textAlign: "center" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 1 }}>
                        <PointsIcon sx={{ fontSize: 40, color: "#FFD700" }} />
                        <Typography variant="h3" component="h1" sx={{ fontWeight: 700 }}>
                            {profile?.points ?? 0}
                        </Typography>
                    </Box>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        Your Points
                    </Typography>
                    <Box sx={{ width: 60, height: 3, backgroundColor: "warning.main", borderRadius: 1, mx: "auto" }} />
                </Box>

                {/* Category Buttons */}
                <Box sx={{ mb: 4, display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                    {CATEGORIES.map((category) => (
                        <Chip
                            key={category}
                            label={category}
                            onClick={() => setSelectedCategory(category)}
                            variant={selectedCategory === category ? "filled" : "outlined"}
                            color={selectedCategory === category ? "warning" : "default"}
                            sx={{
                                px: 1,
                                fontWeight: selectedCategory === category ? 700 : 400,
                            }}
                        />
                    ))}
                </Box>

                {/* Shop Grid */}
                <Grid container spacing={3}>
                    {(selectedCategory === "All" ? pointsShopItems : filteredItems).map((item) => (
                        <Grid item xs={12} sm={6} md={4} key={item.id}>
                            <Card sx={{
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                transition: "transform 0.2s, box-shadow 0.2s",
                                "&:hover": {
                                    transform: "translateY(-4px)",
                                    boxShadow: 6,
                                },
                            }}>
                                <CardActionArea
                                    onClick={() => {
                                        setSelectedItem(item);
                                        setShowBuyModal(true);
                                    }}
                                    sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "flex-start" }}
                                >
                                    <CardMedia
                                        component="img"
                                        height="180"
                                        image={item.image}
                                        alt={item.name}
                                        sx={{ objectFit: "cover" }}
                                    />
                                    <CardContent sx={{ flexGrow: 1, width: "100%" }}>
                                        <Typography gutterBottom variant="h6" component="h2" sx={{ fontWeight: 600 }}>
                                            {item.name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                        }}>
                                            {item.description}
                                        </Typography>
                                    </CardContent>
                                    <CardActions sx={{ width: "100%", px: 2, pb: 2 }}>
                                        <Typography
                                            variant="subtitle2"
                                            color="warning.main"
                                            sx={{ fontWeight: 700 }}
                                        >
                                            {item.price} Points
                                        </Typography>
                                    </CardActions>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    ))}
                </Grid>

                {/* Empty State */}
                {(selectedCategory !== "All" && filteredItems.length === 0) && (
                    <Box sx={{ textAlign: "center", py: 8 }}>
                        <Typography variant="h6" color="text.secondary">
                            No items in this category
                        </Typography>
                    </Box>
                )}

                {/* Buy Modal */}
                <Dialog
                    fullWidth
                    maxWidth="xs"
                    open={showBuyModal}
                    onClose={() => setShowBuyModal(false)}
                    PaperProps={{
                        sx: { borderRadius: 2 }
                    }}
                >
                    <Box sx={{ position: "relative" }}>
                        {selectedItem?.image && (
                            <CardMedia
                                component="img"
                                height="220"
                                image={selectedItem.image}
                                sx={{ borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
                            />
                        )}
                        <IconButton
                            onClick={() => setShowBuyModal(false)}
                            sx={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                bgcolor: "rgba(0,0,0,0.5)",
                                color: "white",
                                "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
                            }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    <DialogContent sx={{ pt: 3 }}>
                        <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
                            {selectedItem?.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            {selectedItem?.description}
                        </Typography>
                        <Box sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            p: 2,
                            bgcolor: "action.hover",
                            borderRadius: 2,
                            mb: 2,
                        }}>
                            <Box>
                                <Typography variant="caption" color="text.secondary">
                                    Item Price
                                </Typography>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <PointsIcon sx={{ fontSize: 18, color: "#FFD700" }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: "warning.main" }}>
                                        {selectedItem?.price}
                                    </Typography>
                                </Box>
                            </Box>
                            <Divider orientation="vertical" flexItem />
                            <Box sx={{ textAlign: "center" }}>
                                <Typography variant="caption" color="text.secondary">
                                    After Purchase
                                </Typography>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <PointsIcon sx={{ fontSize: 18, color: "#FFD700" }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: (profile?.points ?? 0) >= (selectedItem?.price ?? 0) ? "success.main" : "error.main" }}>
                                        {(profile?.points ?? 0) - (selectedItem?.price ?? 0)}
                                    </Typography>
                                </Box>
                            </Box>
                            <Divider orientation="vertical" flexItem />
                            <Box sx={{ textAlign: "right" }}>
                                <Typography variant="caption" color="text.secondary">
                                    Your Balance
                                </Typography>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <PointsIcon sx={{ fontSize: 18, color: "#FFD700" }} />
                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                        {profile?.points ?? 0}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                        {(profile?.points ?? 0) < (selectedItem?.price ?? 0) && (
                            <Typography variant="body2" color="error.main" sx={{ textAlign: "center", mb: 2 }}>
                                You don't have enough points
                            </Typography>
                        )}
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 3 }}>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => setShowBuyModal(false)}
                            sx={{ borderColor: "text.secondary", color: "text.secondary" }}
                        >
                            Cancel
                        </Button>
                        <Button
                            fullWidth
                            variant="contained"
                            color="warning"
                            loading={isBuyingPointsItem}
                            onClick={() => handleBuyItem(selectedItem!)}
                            disabled={(profile?.points ?? 0) < (selectedItem?.price ?? 0)}
                        >
                            Redeem Now
                        </Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </Box>
    );
}