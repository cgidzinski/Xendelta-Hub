import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistance } from "date-fns";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  Skeleton,
  Switch,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import Inventory2Icon from "@mui/icons-material/Inventory2Outlined";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { cardSx } from "../../../components/ui/surfaceStyles";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useTitle } from "../../../hooks/useTitle";
import { InventoryItem, useInventory } from "../../../hooks/user/useInventory";

const ago = (date: string) => formatDistance(new Date(date), new Date(), { addSuffix: true });

function ItemCard({ item, onSelect }: { item: InventoryItem; onSelect: (item: InventoryItem) => void }) {
  return (
    <Card
      variant="outlined"
      sx={{
        ...cardSx,
        height: "100%",
        opacity: item.used ? 0.7 : 1,
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <CardActionArea
        onClick={() => onSelect(item)}
        sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}
      >
        <Box
          sx={{
            position: "relative",
            height: 120,
            bgcolor: "action.hover",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
          }}
        >
          <Box
            component="img"
            src={item.image}
            alt={item.name}
            sx={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              filter: item.used ? "grayscale(1)" : "none",
            }}
          />
          {item.used && (
            <Chip
              size="small"
              label="Redeemed"
              color="success"
              icon={<CheckCircleIcon />}
              sx={{ position: "absolute", top: 8, left: 8 }}
            />
          )}
        </Box>
        <Box sx={{ p: 1.75 }}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
            {item.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {item.used && item.usedAt ? `Redeemed ${ago(item.usedAt)}` : `Bought ${ago(item.purchasedAt)}`}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

export default function Inventory() {
  useTitle("Inventory");
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { inventory, isLoading, isError, error, refetch, redeemItem, trashItem, isUsing, isTrashing } = useInventory();
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [showUsed, setShowUsed] = useState(false);

  if (isError) return <ErrorDisplay error={error} onRetry={() => refetch()} />;

  const hasUsed = inventory.some((item) => item.used);
  const visible = showUsed ? inventory : inventory.filter((item) => !item.used);

  const handleRedeem = async (item: InventoryItem) => {
    setSelected(null);
    await redeemItem(item._id);
  };

  const handleTrash = async (item: InventoryItem) => {
    const ok = await confirm({
      title: "Trash this item?",
      message: item.used
        ? `${item.name} will be removed from your inventory.`
        : `${item.name} has not been redeemed. If you trash it you lose it, and the gems you paid are not refunded.`,
      confirmLabel: "Trash",
    });
    if (!ok) return;
    setSelected(null);
    await trashItem(item._id);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Inventory"
        subtitle="Items you have bought or been given"
        actions={
          hasUsed && (
            <FormControlLabel
              control={<Switch checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} />}
              label="Show redeemed"
              sx={{ mr: 0 }}
            />
          )
        }
      />

      {isLoading ? (
        <Grid container spacing={2}>
          {[0, 1, 2].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Skeleton variant="rectangular" height={190} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Inventory2Icon />}
          title={inventory.length === 0 ? "Nothing here yet" : "No active items"}
          description="Items you buy in the Shop show up here."
          action={
            <Button variant="outlined" onClick={() => navigate("/internal/shop")}>
              Browse the Shop
            </Button>
          }
        />
      ) : (
        <Grid container spacing={2}>
          {visible.map((item) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item._id}>
              <ItemCard item={item} onSelect={setSelected} />
            </Grid>
          ))}
        </Grid>
      )}

      <ResponsiveDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        maxWidth="xs"
        title={selected?.name}
        actions={
          selected && (
            <>
              <IconButton
                color="error"
                aria-label="Trash item"
                disabled={isTrashing}
                onClick={() => handleTrash(selected)}
                sx={{ mr: "auto" }}
              >
                <DeleteIcon />
              </IconButton>
              {selected.used ? (
                <Chip label="Redeemed" color="success" icon={<CheckCircleIcon />} />
              ) : (
                selected.redeemable && (
                  <Button
                    variant="contained"
                    startIcon={<CheckCircleIcon />}
                    loading={isUsing}
                    onClick={() => handleRedeem(selected)}
                  >
                    Redeem
                  </Button>
                )
              )}
            </>
          )
        }
      >
        {selected && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2, display: "flex", justifyContent: "center" }}>
              <Box
                component="img"
                src={selected.image}
                alt=""
                sx={{ height: 120, objectFit: "contain", filter: selected.used ? "grayscale(1)" : "none" }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {selected.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Bought {ago(selected.purchasedAt)}
              {selected.used && selected.usedAt ? ` · Redeemed ${ago(selected.usedAt)}` : ""}
              {!selected.used && !selected.redeemable ? " · Nothing to redeem: this item is just yours to keep." : ""}
            </Typography>
          </Box>
        )}
      </ResponsiveDialog>
    </PageContainer>
  );
}
