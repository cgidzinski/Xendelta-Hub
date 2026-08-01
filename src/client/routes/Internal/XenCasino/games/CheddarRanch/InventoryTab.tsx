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
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SellIcon from "@mui/icons-material/Sell";
import { useSnackbar } from "notistack";
import { formatCheddar } from "../../utils/currency";
import { RanchItem, useCasinoRanch } from "../../../../../hooks/casino/useCasinoRanch";
import { ITEM_EMOJI } from "./shared";

export default function InventoryTab({ items }: { items: RanchItem[] }) {
    const { sellItem, isSellingItem, useItem, isUsingItem } = useCasinoRanch();
    const { enqueueSnackbar } = useSnackbar();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const selectedItem = items.find((i) => i.key === selectedKey) ?? null;

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

    const handleUse = () => {
        if (!selectedItem) {
            return;
        }
        useItem({ itemKey: selectedItem.key })
            .then((r) => {
                enqueueSnackbar(r.message, { variant: "info" });
                setSelectedKey(null);
            })
            .catch((e) => enqueueSnackbar(e.message || "Failed to use item", { variant: "error" }));
    };

    if (items.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 2 }}>
                No items yet - collect from a creature on the Ranch tab.
            </Typography>
        );
    }

    return (
        <>
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
                        <Typography sx={{ fontSize: 36 }}>{ITEM_EMOJI[item.key] ?? "📦"}</Typography>
                        <Typography variant="caption" sx={{ textAlign: "center", fontWeight: 600 }}>
                            {item.label}
                        </Typography>
                    </CardActionArea>
                ))}
            </Box>

            <Dialog open={!!selectedItem} onClose={() => setSelectedKey(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    Item Details
                    <IconButton onClick={() => setSelectedKey(null)} aria-label="Close">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                {selectedItem && (
                    <DialogContent sx={{ pb: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                        <Typography sx={{ fontSize: 48 }}>{ITEM_EMOJI[selectedItem.key] ?? "📦"}</Typography>
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
                            <Button variant="outlined" fullWidth disabled={isUsingItem} onClick={handleUse}>
                                Use
                            </Button>
                            <Button variant="contained" fullWidth startIcon={<SellIcon />} disabled={isSellingItem} onClick={handleSell}>
                                Sell All ({formatCheddar(selectedItem.quantity * selectedItem.sellValue)})
                            </Button>
                        </Box>
                    </DialogContent>
                )}
            </Dialog>
        </>
    );
}
