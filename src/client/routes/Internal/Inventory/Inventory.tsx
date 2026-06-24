import { Box, Container, Typography, Button, Card, CardActionArea, CardMedia, CardContent, Grid, Chip, Dialog, DialogContent, DialogActions, IconButton, Switch, FormControlLabel } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useInventory, InventoryItem } from "../../../hooks/user/useInventory";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { formatDistance } from "date-fns";
import { useState } from "react";

export default function Inventory() {
  const { inventory, isLoading, useItem, trashItem, isUsing, isTrashing } = useInventory();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showUsed, setShowUsed] = useState(false);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const visibleItems = showUsed ? inventory : inventory.filter(item => !item.used);

  return (
    <Box>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 4 }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
              Inventory
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Your purchased items
            </Typography>
          </Box>
          {inventory.some(item => item.used) && (
            <FormControlLabel
              control={
                <Switch
                  checked={showUsed}
                  onChange={(e) => setShowUsed(e.target.checked)}
                  color="warning"
                />
              }
              label="Show Used"
              labelPlacement="start"
              sx={{ mr: 0 }}
            />
          )}
        </Box>

        {visibleItems.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              {showUsed ? "No items" : "No active items"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {showUsed ? "You haven't purchased any items yet" : "Purchase items from the Shop to see them here"}
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {visibleItems.map((item) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item._id}>
                <Card
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    border: item.used ? "2px solid" : "none",
                    borderColor: "success.main",
                    opacity: item.used ? 0.8 : 1,
                    transition: "opacity 0.2s, transform 0.2s, box-shadow 0.2s, border-color 0.2s",
                    "&:hover": item.used ? {
                      borderColor: "success.light",
                    } : {
                      transform: "translateY(-4px)",
                      boxShadow: 6,
                    },
                  }}
                >
                  {item.used && (
                    <Chip
                      size="small"
                      label="Redeemed"
                      color="success"
                      icon={<CheckCircleIcon />}
                      sx={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        zIndex: 1,
                      }}
                    />
                  )}
                  <CardActionArea
                    onClick={() => setSelectedItem(item)}
                    sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "flex-start" }}
                  >
                    <CardMedia
                      component="img"
                      height="160"
                      image={item.image}
                      alt={item.name}
                      sx={{ objectFit: "cover", width: "100%", filter: item.used ? "grayscale(40%)" : "none" }}
                    />
                    <CardContent sx={{ flexGrow: 1, width: "100%" }}>
                      <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
                        {item.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Purchased {formatDistance(new Date(item.purchasedAt), new Date(), { addSuffix: true })}
                      </Typography>
                      {item.used && item.usedAt && (
                        <Typography variant="body2" color="success.main" sx={{ mt: 0.5 }}>
                          Redeemed {formatDistance(new Date(item.usedAt), new Date(), { addSuffix: true })}
                        </Typography>
                      )}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      {/* Item Detail Modal */}
      <Dialog
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        {selectedItem && (
          <>
            <Box sx={{ position: "relative" }}>
              <CardMedia
                component="img"
                height="240"
                image={selectedItem.image}
                alt={selectedItem.name}
                sx={{ borderTopLeftRadius: 8, borderTopRightRadius: 8, filter: selectedItem.used ? "grayscale(40%)" : "none" }}
              />
              <IconButton
                onClick={() => setSelectedItem(null)}
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
                {selectedItem.name}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {selectedItem.description}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Purchased {formatDistance(new Date(selectedItem.purchasedAt), new Date(), { addSuffix: true })}
              </Typography>
              {selectedItem.used && selectedItem.usedAt && (
                <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
                  Redeemed {formatDistance(new Date(selectedItem.usedAt), new Date(), { addSuffix: true })}
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
              <IconButton
                color="error"
                disabled={isTrashing}
                onClick={() => {
                  trashItem(selectedItem._id);
                  setSelectedItem(null);
                }}
              >
                <DeleteIcon />
              </IconButton>
              {!selectedItem.used && selectedItem.redeemable && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  disabled={isUsing}
                  onClick={() => {
                    useItem(selectedItem._id);
                    setSelectedItem(null);
                  }}
                  sx={{ flexGrow: 1 }}
                >
                  {isUsing ? "Redeeming..." : "Redeem"}
                </Button>
              )}
              {selectedItem.used && (
                <Chip label="Redeemed" color="success" icon={<CheckCircleIcon />} />
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}