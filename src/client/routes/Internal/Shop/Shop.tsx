import { Box, Card, CardActionArea, CardActions, CardContent, CardMedia, Container, DialogActions, DialogContent, DialogTitle, Typography, Button, Dialog, DialogContentText } from "@mui/material";
import { PointsShopItem, usePointsShopItems } from "../../../hooks/user/usePoints";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useState } from "react";
export default function Shop() {
    const { pointsShopItems, isLoading, isError, error, refetch, buyPointsItemMutation, isBuyingPointsItem, buyPointsItemError } = usePointsShopItems();
    const [showBuyModal, setShowBuyModal] = useState<boolean>(false);
    const [selectedItem, setSelectedItem] = useState<PointsShopItem | null>(null);
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
    }


    return (
        <Box>
            <Container maxWidth="xl" sx={{ mt: 4 }}>
                {/* Welcome Section */}
                <Box sx={{ mb: 4 }}>
                    <Typography variant="h3" component="h1" gutterBottom>
                        Points Shop
                    </Typography>
                    <Typography variant="h6" color="text.secondary">
                        Redeem items with your points!
                    </Typography>
                </Box>

                {/* Quick Stats Cards */}
                <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', gap: 2 }}>

                    {pointsShopItems.map((item) => (
                        <Box key={item.id}>
                            <Card sx={{ width: 345 }}>
                                <CardActionArea onClick={() => {
                                    setSelectedItem(item);
                                    setShowBuyModal(true);
                                }}>
                                    <CardMedia
                                        component="img"
                                        height="345"
                                        image={item.image}
                                    />
                                    <CardContent>
                                        <Typography gutterBottom variant="h5" component="div">
                                            {item.name}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            {item.description}
                                        </Typography>
                                    </CardContent>
                                    <CardActions>
                                        <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 'bold', pl: 1 }}>
                                            {item.price} Points
                                        </Typography>
                                    </CardActions>
                                </CardActionArea>
                            </Card>
                        </Box>
                    ))}
                </Box>
                <Dialog
                    fullWidth
                    maxWidth="md"
                    open={showBuyModal}
                    onClose={() => setShowBuyModal(false)}
                    aria-labelledby="alert-dialog-title"
                    aria-describedby="alert-dialog-description"
                >
                    <DialogTitle id="alert-dialog-title">
                        Redeem {selectedItem?.name} for {selectedItem?.price} Points?
                    </DialogTitle>
                    <DialogContent>
                        <CardMedia
                            component="img"
                            height="140"
                            image={selectedItem?.image}
                        />
                        <DialogContentText id="alert-dialog-description">
                            {selectedItem?.description}
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button loading={isBuyingPointsItem} onClick={() => setShowBuyModal(false)}>Cancel</Button>
                        <Button loading={isBuyingPointsItem} onClick={() => handleBuyItem(selectedItem!)} autoFocus>
                            Redeem
                        </Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </Box>
    );
}



