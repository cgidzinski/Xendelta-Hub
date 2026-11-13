import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  Drawer,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ListAltIcon from "@mui/icons-material/ListAlt";
import TimerIcon from "@mui/icons-material/Timer";
import { useWakeLock } from "../../../../hooks/useWakeLock";
import { formatMinutes } from "@shared/xenkitchen/kitchen";
import { alarm } from "./alarm";
import { clampStep, formatCountdown, remainingSeconds, runningTimers, swipeDirection } from "./cookLogic";
import { useStepTimers } from "./useStepTimers";

export interface CookStep {
  text: string;
  timer_minutes: number | null;
}
export interface CookIngredient {
  /** A stable key for the line (its place in the recipe). */
  key: number;
  /** "1½ cups flour, sifted", already scaled to the servings on screen. */
  text: string;
  section: string;
}

interface CookModeProps {
  open: boolean;
  onClose: () => void;
  title: string;
  accent: string;
  steps: CookStep[];
  ingredients: CookIngredient[];
  /** The ingredients ticked off (shared with the recipe page, so the ticks are the same in both). */
  checked: Set<number>;
  onToggleIngredient: (key: number) => void;
}

/**
 * Cook a recipe one step at a time: big text, next and previous (buttons, arrow keys, or a swipe), the screen kept awake,
 * the ingredients in a sheet you can tick off, and timers that keep running while you move between steps.
 */
export default function CookMode({
  open,
  onClose,
  title,
  accent,
  steps,
  ingredients,
  checked,
  onToggleIngredient,
}: CookModeProps) {
  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState(false);
  const { timers, now, start, stop } = useStepTimers(() => alarm());
  const touch = useRef<{ x: number; y: number } | null>(null);
  useWakeLock(open);

  // Start at the first step each time it is opened.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const total = steps.length;
  const step = steps[clampStep(index, total)];
  const go = (to: number) => setIndex(clampStep(to, total));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (sheet) return;
      if (e.key === "ArrowRight") setIndex((i) => clampStep(i + 1, total));
      else if (e.key === "ArrowLeft") setIndex((i) => clampStep(i - 1, total));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sheet, total]);

  const running = useMemo(() => runningTimers(timers, now), [timers, now]);
  const remainingIngredients = ingredients.filter((i) => !checked.has(i.key)).length;
  const onLast = index >= total - 1;
  const thisTimer = timers[index];

  if (total === 0) return null;

  return (
    <Dialog open={open} onClose={onClose} fullScreen aria-label={`Cooking ${title}`}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1 }}>
          <IconButton aria-label="Stop cooking" onClick={onClose}>
            <CloseIcon />
          </IconButton>
          <Typography noWrap sx={{ flex: 1, fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
            Step {index + 1} of {total}
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={((index + 1) / total) * 100}
          aria-label="Progress through the steps"
          sx={{ height: 4, "& .MuiLinearProgress-bar": { bgcolor: accent } }}
        />

        {running.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ px: 2, py: 1 }}>
            {running.map((t) => (
              <Chip
                key={t.step}
                size="small"
                icon={<TimerIcon />}
                color={t.finished ? "warning" : "default"}
                variant={t.step === index ? "filled" : "outlined"}
                label={`Step ${t.step + 1} · ${t.finished ? "Done!" : formatCountdown(t.seconds)}`}
                onClick={() => go(t.step)}
                onDelete={t.finished ? () => stop(t.step) : undefined}
              />
            ))}
          </Stack>
        )}

        <Box
          // A swipe moves between steps; the step text is also the target, so a thumb anywhere on it works.
          onTouchStart={(e) => {
            touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchEnd={(e) => {
            if (!touch.current) return;
            const dx = e.changedTouches[0].clientX - touch.current.x;
            const dy = e.changedTouches[0].clientY - touch.current.y;
            touch.current = null;
            const dir = swipeDirection(dx, dy);
            if (dir) go(index + (dir === "next" ? 1 : -1));
          }}
          sx={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            px: { xs: 2.5, sm: 6 },
            py: 2,
            touchAction: "pan-y",
          }}
        >
          <Typography
            component="p"
            sx={{
              fontSize: { xs: "1.6rem", sm: "2.25rem" },
              lineHeight: 1.35,
              fontWeight: 500,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {step.text}
          </Typography>
          {step.timer_minutes ? (
            <Box sx={{ mt: 3 }}>
              {thisTimer === undefined ? (
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<TimerIcon />}
                  onClick={() => start(index, step.timer_minutes!)}
                >
                  Start {formatMinutes(step.timer_minutes)} timer
                </Button>
              ) : (
                <Button
                  variant="contained"
                  size="large"
                  color={thisTimer <= now ? "warning" : "primary"}
                  startIcon={<TimerIcon />}
                  onClick={() => stop(index)}
                >
                  {thisTimer <= now
                    ? "Done! Tap to clear"
                    : `${formatCountdown(remainingSeconds(thisTimer, now))} · tap to stop`}
                </Button>
              )}
            </Box>
          ) : null}
        </Box>

        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}
        >
          <Badge badgeContent={remainingIngredients} color="primary" invisible={remainingIngredients === 0}>
            <Button variant="outlined" startIcon={<ListAltIcon />} onClick={() => setSheet(true)}>
              Ingredients
            </Button>
          </Badge>
          <Box sx={{ flex: 1 }} />
          <IconButton aria-label="Previous step" size="large" disabled={index === 0} onClick={() => go(index - 1)}>
            <NavigateBeforeIcon fontSize="large" />
          </IconButton>
          <Button
            variant="contained"
            size="large"
            endIcon={onLast ? undefined : <NavigateNextIcon />}
            onClick={() => (onLast ? onClose() : go(index + 1))}
            sx={{ minWidth: 128, bgcolor: accent, "&:hover": { bgcolor: accent, filter: "brightness(0.92)" } }}
          >
            {onLast ? "Finish" : "Next"}
          </Button>
        </Stack>
      </Box>

      {/* A drawer sits below a dialog by default (MUI's z-index order), so lift it above the full-screen view it opens from. */}
      <Drawer
        anchor="bottom"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
        open={sheet}
        onClose={() => setSheet(false)}
        slotProps={{ paper: { sx: { maxHeight: "75vh", borderRadius: "12px 12px 0 0" } } }}
      >
        <Box sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
              Ingredients
            </Typography>
            <Button onClick={() => setSheet(false)}>Done</Button>
          </Stack>
          {ingredients.length === 0 && <Typography color="text.secondary">No ingredients.</Typography>}
          {ingredients.map((ing, i) => (
            <Box key={ing.key}>
              {ing.section && ing.section !== ingredients[i - 1]?.section && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  {ing.section}
                </Typography>
              )}
              <Box
                component="label"
                sx={{ display: "flex", alignItems: "center", gap: 0.5, py: 0.25, cursor: "pointer" }}
              >
                <Checkbox size="small" checked={checked.has(ing.key)} onChange={() => onToggleIngredient(ing.key)} />
                <Typography
                  sx={{
                    textDecoration: checked.has(ing.key) ? "line-through" : "none",
                    opacity: checked.has(ing.key) ? 0.5 : 1,
                  }}
                >
                  {ing.text}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Drawer>
    </Dialog>
  );
}
