import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Grid, Skeleton, Typography } from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2Outlined";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useTitle } from "../../../hooks/useTitle";
import { InventoryItem, useInventory } from "../../../hooks/user/useInventory";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import AccountCard from "./components/AccountCard";
import InventoryCard from "./components/InventoryCard";
import InventoryFilter, { type InventoryView } from "./components/InventoryFilter";

const matches = (view: InventoryView, item: InventoryItem) =>
  view === "all" || (view === "redeemed" ? item.used : !item.used && Boolean(item.redeemable));

export default function Inventory() {
  useTitle("Inventory");
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { profile } = useUserProfile();
  const { inventory, isLoading, isError, error, refetch, redeemItem, trashItem } = useInventory();
  const [view, setView] = useState<InventoryView>("all");
  // The item a request is in flight for, so only its card shows as busy.
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (isError) return <ErrorDisplay error={error} onRetry={() => refetch()} />;

  const counts: Record<InventoryView, number> = {
    all: inventory.length,
    redeem: inventory.filter((item) => matches("redeem", item)).length,
    redeemed: inventory.filter((item) => matches("redeemed", item)).length,
  };
  const visible = inventory.filter((item) => matches(view, item));

  const withPending = async (item: InventoryItem, run: () => Promise<unknown>) => {
    setPendingId(item._id);
    try {
      await run();
    } finally {
      setPendingId(null);
    }
  };

  const handleTrash = async (item: InventoryItem) => {
    const ok = await confirm({
      title: "Trash this item?",
      message: item.used
        ? `${item.name} will be removed from your inventory.`
        : `${item.name} has not been redeemed. If you trash it you lose it, and the gems you paid are not refunded.`,
      confirmLabel: "Trash",
    });
    if (ok) await withPending(item, () => trashItem(item._id));
  };

  return (
    <PageContainer>
      <PageHeader
        title="Inventory"
        subtitle="Your account and the items you own"
        actions={<Button onClick={() => navigate("/internal/shop")}>Open the Shop</Button>}
      />

      <Grid container spacing={3} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 4 }}>
          <AccountCard profile={profile} inventory={inventory} />
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <InventoryFilter value={view} onChange={setView} counts={counts} />
            {!isLoading && (
              <Typography variant="body2" color="text.secondary">
                Showing {visible.length} of {inventory.length}
              </Typography>
            )}
          </Box>

          {isLoading ? (
            <Grid container spacing={2}>
              {[0, 1, 2].map((i) => (
                <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={i}>
                  <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 2 }} />
                </Grid>
              ))}
            </Grid>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Inventory2Icon />}
              title={inventory.length === 0 ? "Nothing here yet" : "Nothing in this view"}
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
                <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={item._id}>
                  <InventoryCard
                    item={item}
                    onRedeem={(i) => withPending(i, () => redeemItem(i._id))}
                    onTrash={handleTrash}
                    busy={pendingId === item._id}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </Grid>
      </Grid>
    </PageContainer>
  );
}
