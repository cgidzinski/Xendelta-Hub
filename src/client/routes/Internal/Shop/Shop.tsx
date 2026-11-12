import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Grid, Skeleton, Stack } from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory2Outlined";
import StorefrontIcon from "@mui/icons-material/StorefrontOutlined";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorDisplay from "../../../components/ErrorDisplay";
import GemAmount from "../../../components/GemAmount";
import { useTitle } from "../../../hooks/useTitle";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { useBuyShopItem, useGemShop, type ShopItem } from "../../../hooks/user/useGems";
import BuyItemDialog from "./components/BuyItemDialog";
import GemHero from "./components/GemHero";
import ShopItemCard from "./components/ShopItemCard";
import ShopItemRow from "./components/ShopItemRow";

/** Items in this category get their own compact section under the gems; everything else is "Other items". */
const STORAGE = "Storage";

export default function Shop() {
  useTitle("Shop");
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const { items, isLoading, isError, error, refetch } = useGemShop();
  const { buy, isBuying } = useBuyShopItem();
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const balance = profile?.gems ?? 0;
  const storage = items.filter((item) => item.category === STORAGE);
  const other = items.filter((item) => item.category !== STORAGE);

  const handleBuy = async (item: ShopItem) => {
    if (await buy(item)) setSelected(null);
  };

  const handleGetGems = () => {
    setSelected(null);
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

      <Stack spacing={3.5}>
        <Box ref={heroRef} sx={{ scrollMarginTop: 16 }}>
          <GemHero balance={balance} />
        </Box>

        {isLoading ? (
          <Grid container spacing={2}>
            {[0, 1].map((i) => (
              <Grid size={{ xs: 12, md: 6 }} key={i}>
                <Skeleton variant="rectangular" height={88} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<StorefrontIcon />}
            title="Nothing here yet"
            description="The shop has no items right now."
          />
        ) : (
          <>
            {storage.length > 0 && (
              <Box>
                <SectionLabel>Storage</SectionLabel>
                <Grid container spacing={2}>
                  {storage.map((item) => (
                    <Grid size={{ xs: 12, md: 6 }} key={item.id}>
                      <ShopItemRow item={item} onSelect={setSelected} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {other.length > 0 && (
              <Box>
                <SectionLabel>Other items</SectionLabel>
                <Grid container spacing={2}>
                  {other.map((item) => (
                    <Grid size={{ xs: 12, sm: 6, md: 3 }} key={item.id}>
                      <ShopItemCard item={item} onSelect={setSelected} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </>
        )}
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
