import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Chip, Grid, Skeleton, Stack } from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory2Outlined";
import StorefrontIcon from "@mui/icons-material/StorefrontOutlined";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionCard from "../../../components/ui/SectionCard";
import SectionLabel from "../../../components/ui/SectionLabel";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import GemAmount from "../../../components/GemAmount";
import { useTitle } from "../../../hooks/useTitle";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { useBuyShopItem, useGemShop, type ShopItem } from "../../../hooks/user/useGems";
import BuyItemDialog from "./components/BuyItemDialog";
import GemPacks from "./components/GemPacks";
import ShopItemCard from "./components/ShopItemCard";

const ALL = "All";

export default function Shop() {
  useTitle("Shop");
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const { items, isLoading, isError, error, refetch } = useGemShop();
  const { buy, isBuying } = useBuyShopItem();
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [category, setCategory] = useState(ALL);
  const packsRef = useRef<HTMLDivElement>(null);

  const balance = profile?.gems ?? 0;
  // The chips come from the data, so a category with nothing in it never shows up as a dead end.
  const categories = useMemo(() => [ALL, ...Array.from(new Set(items.map((item) => item.category)))], [items]);
  const visible = category === ALL ? items : items.filter((item) => item.category === category);

  const handleBuy = async (item: ShopItem) => {
    if (await buy(item)) setSelected(null);
  };

  const handleGetGems = () => {
    setSelected(null);
    packsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isError) return <ErrorDisplay error={error} onRetry={() => refetch()} />;

  return (
    <PageContainer>
      <PageHeader
        title="Shop"
        subtitle={
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
            Your balance <GemAmount amount={balance} variant="body2" iconSize={16} />
          </Box>
        }
        actions={
          <Button startIcon={<InventoryIcon />} onClick={() => navigate("/internal/inventory")}>
            Inventory
          </Button>
        }
      />

      <Stack spacing={3}>
        <Box ref={packsRef} sx={{ scrollMarginTop: 16 }}>
          <SectionCard title="Get gems" description="Gems buy items in the shop.">
            <GemPacks />
          </SectionCard>
        </Box>

        <Box>
          <SectionLabel>Items</SectionLabel>
          {isLoading ? (
            <Grid container spacing={2}>
              {[0, 1, 2].map((i) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                  <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 2 }} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <>
              {categories.length > 2 && (
                <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {categories.map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      onClick={() => setCategory(name)}
                      color={category === name ? "primary" : "default"}
                      variant={category === name ? "filled" : "outlined"}
                    />
                  ))}
                </Box>
              )}
              {visible.length === 0 ? (
                <EmptyState
                  icon={<StorefrontIcon />}
                  title="Nothing here yet"
                  description={category === ALL ? "The shop has no items right now." : "No items in this category."}
                />
              ) : (
                <Grid container spacing={2}>
                  {visible.map((item) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item.id}>
                      <ShopItemCard item={item} onSelect={setSelected} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </>
          )}
        </Box>
      </Stack>

      <BuyItemDialog
        item={selected}
        balance={balance}
        isBuying={isBuying}
        onClose={() => setSelected(null)}
        onBuy={handleBuy}
        onGetGems={handleGetGems}
      />
    </PageContainer>
  );
}
