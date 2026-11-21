import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import LibraryAddIcon from "@mui/icons-material/LibraryAdd";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import PublicJoinCard from "../components/PublicJoinCard";
import ShareLinkGate from "../components/ShareLinkGate";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import {
  useClonePublicKitchenItem,
  usePublicKitchenBookItem,
  usePublicKitchenItem,
} from "../../../hooks/xenkitchen/useKitchen";
import ItemView from "../../Internal/XenKitchen/components/ItemView";
import { TimerProvider } from "../../Internal/XenKitchen/timers/TimerProvider";
import { BRAND_NAME } from "@shared/brand";
import { clickableRowProps } from "../../../utils/keyboard";

/** Read-only page behind /k/:token (one shared item) or /k/b/:token/:itemId (an item in a shared book). Works signed out. */
function XenKitchenPublicContent() {
  const { token, itemId } = useParams<{ token: string; itemId?: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { isAuthenticated } = useAuth();
  const single = usePublicKitchenItem(itemId ? undefined : token);
  const inBook = usePublicKitchenBookItem(itemId ? token : undefined, itemId);
  const { item, isLoading, isError, error, refetch } = itemId ? inBook : single;
  const owner = itemId ? null : single.owner;
  const here = itemId ? `/k/b/${token}/${itemId}` : `/k/${token}`;
  const clone = useClonePublicKitchenItem();
  useTitle(item?.title || "XenKitchen");

  const save = () => {
    if (!token) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: { pathname: here } } });
      return;
    }
    clone.mutate(
      { token, itemId },
      {
        onSuccess: ({ item: copy }) => {
          enqueueSnackbar("Saved to your kitchen", { variant: "success" });
          navigate(`/internal/xenkitchen/${copy._id}`);
        },
        onError: () => enqueueSnackbar("Couldn't save it", { variant: "error" }),
      },
    );
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          borderBottom: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(10px)",
          backgroundColor: alpha(theme.palette.background.paper, 0.8),
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, sm: 3 }, py: 1.5 }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            {...clickableRowProps(() => navigate("/"))}
            aria-label="XenKitchen home"
            sx={{ cursor: "pointer" }}
          >
            <RestaurantMenuIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              XenKitchen
            </Typography>
          </Stack>
          <Button size="small" onClick={() => navigate(isAuthenticated ? "/internal/xenkitchen" : "/")}>
            {isAuthenticated ? "My kitchen" : BRAND_NAME}
          </Button>
        </Stack>
      </Box>

      <Container maxWidth="md" sx={{ py: 3 }}>
        {isLoading && <LoadingSpinner message="Loading…" />}
        {!isLoading && (isError || !item) && (
          <ErrorDisplay error={error} title="This link isn't available" onRetry={() => refetch()} />
        )}
        {item && (
          <>
            {itemId && (
              <Button size="small" color="inherit" onClick={() => navigate(`/k/b/${token}`)} sx={{ mb: 1 }}>
                ← {inBook.bookName ?? "Back to the book"}
              </Button>
            )}
            {owner && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Shared by {owner}
              </Typography>
            )}
            <TimerProvider>
              <ItemView
                item={item}
                actions={
                  <Button variant="contained" startIcon={<LibraryAddIcon />} onClick={save} disabled={clone.isPending}>
                    {isAuthenticated ? (clone.isPending ? "Saving…" : "Save to my kitchen") : "Sign in to save"}
                  </Button>
                }
              />
            </TimerProvider>
            <PublicJoinCard app="xenkitchen" />
          </>
        )}
      </Container>
    </Box>
  );
}

/** A member of the book (or its owner) goes to the item in the app; anyone else reads it here. */
export default function XenKitchenPublic() {
  const { token, itemId } = useParams<{ token: string; itemId?: string }>();
  const url = token ? (itemId ? `/api/xenkitchen/shared/book/${token}` : `/api/xenkitchen/shared/${token}`) : undefined;
  return (
    <ShareLinkGate<{ access: string; item_id?: string }>
      url={url}
      target={(a) => (a.access === "member" ? `/internal/xenkitchen/${itemId ?? a.item_id}` : null)}
    >
      <XenKitchenPublicContent />
    </ShareLinkGate>
  );
}
