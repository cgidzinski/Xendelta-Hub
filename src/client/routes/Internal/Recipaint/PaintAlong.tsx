import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Chip, IconButton, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { useTitle } from "../../../hooks/useTitle";
import { useRecipaintRecipe } from "../../../hooks/recipaint/useRecipaint";
import { useRecipeProgress } from "../../../hooks/recipaint/useRecipeProgress";
import { useWakeLock } from "../../../hooks/useWakeLock";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import ImageGallery from "./components/ImageGallery";
import PaintChip from "./components/PaintChip";
import { cleanPaints } from "../../../../shared/recipaint/paints";

/**
 * One step at a time, for painting from rather than reading. Big images, the paints for
 * this step only, and a screen that doesn't dim while you have a wet brush in your hand.
 */
export default function PaintAlong() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipe, isLoading, isError, error, refetch } = useRecipaintRecipe(id);
  const { completedSteps, toggleStep } = useRecipeProgress(id);
  const [current, setCurrent] = useState(0);
  const [keepAwake, setKeepAwake] = useState(true);
  const { isSupported: wakeLockSupported } = useWakeLock(keepAwake);

  useTitle(recipe ? `${recipe.title} - paint along` : "Paint along");

  const steps = recipe?.steps || [];
  const total = steps.length;
  const step = steps[current];
  const exit = () => navigate(`/internal/recipaint/${id}`);

  // Clamp when the recipe loads (or shrinks) so we never sit past the last step.
  useEffect(() => {
    if (total > 0 && current > total - 1) setCurrent(total - 1);
  }, [total, current]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setCurrent((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setCurrent((i) => Math.min(total - 1, i + 1));
      else if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (isLoading) return <LoadingSpinner message="Loading recipe..." />;

  if (isError || !recipe) {
    return (
      <Box sx={{ p: 2 }}>
        <ErrorDisplay error={error} title="Couldn't load this recipe" onRetry={() => refetch()} />
      </Box>
    );
  }

  if (total === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          This recipe has no steps yet
        </Typography>
        <Button onClick={exit}>Back to the recipe</Button>
      </Box>
    );
  }

  const doneCount = steps.filter((_, i) => completedSteps.has(i)).length;
  const isDone = completedSteps.has(current);
  const paints = cleanPaints(step.paints);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", p: 2, gap: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap>
          {recipe.title}
        </Typography>
        {wakeLockSupported && (
          // An icon toggle rather than a labelled checkbox: on a phone the label wrapped
          // onto a second line and squeezed the recipe title.
          <Tooltip title={keepAwake ? "Screen stays on" : "Screen may dim"}>
            <IconButton
              onClick={() => setKeepAwake((on) => !on)}
              aria-label="Keep screen on"
              aria-pressed={keepAwake}
              color={keepAwake ? "primary" : "default"}
            >
              {keepAwake ? <LightbulbIcon /> : <LightbulbOutlinedIcon />}
            </IconButton>
          </Tooltip>
        )}
        <IconButton onClick={exit} aria-label="Exit paint along">
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Step {current + 1} of {total}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {doneCount} done
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={(doneCount / total) * 100}
          color={doneCount === total ? "success" : "primary"}
          sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { borderRadius: 3 } }}
        />
      </Box>

      <Box sx={{ flexGrow: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: "wrap", rowGap: 1 }}>
          <Chip label={current + 1} size="small" sx={{ borderRadius: 1, fontWeight: 600, minWidth: 28 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {step.stepName || `Step ${current + 1}`}
          </Typography>
          {step.method && (
            <Typography variant="body2" sx={{ fontStyle: "italic", color: "primary.main" }}>
              {step.method}
            </Typography>
          )}
        </Stack>

        {paints.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, mb: 2 }}>
            {paints.map((paint, i) => (
              <PaintChip key={i} paint={paint} />
            ))}
          </Stack>
        )}

        {step.text && (
          <Typography variant="body1" sx={{ fontSize: "1.1rem", lineHeight: 1.7, whiteSpace: "pre-wrap", mb: 2 }}>
            {step.text}
          </Typography>
        )}

        {step.images && step.images.length > 0 && <ImageGallery images={step.images} />}
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ position: "sticky", bottom: 0, py: 1.5, bgcolor: "background.default" }}
      >
        {/* Icon-only paging, so the primary action keeps the width on a phone. */}
        <IconButton
          aria-label="Previous step"
          disabled={current === 0}
          onClick={() => setCurrent((i) => Math.max(0, i - 1))}
          sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Button
          fullWidth
          size="large"
          variant={isDone ? "outlined" : "contained"}
          color={isDone ? "success" : "primary"}
          onClick={() => {
            toggleStep(current);
            // Ticking the last step should stay put rather than dead-ending on a jump.
            if (!isDone && current < total - 1) setCurrent(current + 1);
          }}
        >
          {isDone ? "Done - tap to undo" : current < total - 1 ? "Done, next step" : "Done"}
        </Button>
        <IconButton
          aria-label="Next step"
          disabled={current === total - 1}
          onClick={() => setCurrent((i) => Math.min(total - 1, i + 1))}
          sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
        >
          <ChevronRightIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}
