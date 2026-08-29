import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Card, Container, Stack, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import BrushIcon from "@mui/icons-material/Brush";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { usePublicRecipaintRecipe, useCloneRecipe } from "../../../hooks/recipaint/useRecipaint";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { cardSx } from "../../../components/ui/surfaceStyles";
import RecipeView from "../../Internal/Recipaint/components/RecipeView";

export default function RecipaintPublic() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { isAuthenticated } = useAuth();
  const { recipe, isLoading, isError, error, refetch } = usePublicRecipaintRecipe(id);
  const cloneRecipe = useCloneRecipe();
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useTitle(recipe?.title || "Recipe");

  const handleStepToggle = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Signed out, send them through login and land them on this recipe inside the hub, where
  // the Clone button is waiting - rather than inventing a deferred post-login action.
  const handleClone = () => {
    if (!id) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: { pathname: `/internal/recipaint/${id}` } } });
      return;
    }
    cloneRecipe.mutate(id, {
      onSuccess: (cloned) => {
        enqueueSnackbar("Recipe cloned to your account", { variant: "success" });
        navigate(`/internal/recipaint/${cloned._id}`);
      },
      onError: (err: Error) => {
        enqueueSnackbar(err.message || "Failed to clone recipe", { variant: "error" });
      },
    });
  };

  const cloneLabel = !isAuthenticated
    ? "Sign in to clone"
    : cloneRecipe.isPending
      ? "Cloning..."
      : "Clone to my account";

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
          backgroundColor: "rgba(18, 18, 18, 0.8)",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
          sx={{ maxWidth: 900, mx: "auto", px: { xs: 2, sm: 3 }, py: 1.5 }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
            <BrushIcon sx={{ color: "primary.main" }} />
            <Typography
              variant="h6"
              onClick={() => navigate("/")}
              sx={{
                fontWeight: 700,
                cursor: "pointer",
                background: "linear-gradient(90deg, #2196f3 0%, #1e88e5 50%, #1976d2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                "&:hover": { opacity: 0.8 },
              }}
              noWrap
            >
              Recipaint
            </Typography>
          </Stack>
          <Button size="small" onClick={() => navigate(isAuthenticated ? "/internal/recipaint" : "/")}>
            {isAuthenticated ? "My recipes" : "Xendelta Hub"}
          </Button>
        </Stack>
      </Box>

      <Container maxWidth="md" sx={{ py: 4 }}>
        {isLoading && <LoadingSpinner message="Loading recipe..." />}

        {!isLoading && (isError || !recipe) && (
          <ErrorDisplay
            error={error}
            title="This recipe isn't available"
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && recipe && (
          <>
            <RecipeView
              recipe={recipe}
              completedSteps={completedSteps}
              onStepToggle={handleStepToggle}
              onResetProgress={() => setCompletedSteps(new Set())}
              actions={
                <Button
                  variant="contained"
                  startIcon={<ContentCopyIcon />}
                  onClick={handleClone}
                  disabled={cloneRecipe.isPending}
                >
                  {cloneLabel}
                </Button>
              }
            />

            <Card variant="outlined" sx={{ ...cardSx, p: 3, mt: 4, textAlign: "center" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                Painting this one?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Clone it into your own account to tweak the steps and keep your progress.
              </Typography>
              <Button
                variant="contained"
                startIcon={<ContentCopyIcon />}
                onClick={handleClone}
                disabled={cloneRecipe.isPending}
              >
                {cloneLabel}
              </Button>
            </Card>
          </>
        )}
      </Container>
    </Box>
  );
}
