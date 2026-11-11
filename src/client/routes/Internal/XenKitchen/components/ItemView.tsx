import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Box, Card, Checkbox, Chip, Dialog, FormControlLabel, IconButton, Stack, Switch, Tooltip, Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import RemoveIcon from "@mui/icons-material/Remove";
import AddIcon from "@mui/icons-material/Add";
import TimerIcon from "@mui/icons-material/Timer";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import { cardSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { useWakeLock } from "../../../../hooks/useWakeLock";
import {
  COOK_METHOD_LABELS, formatMinuteRange, formatMinutes, scaleQuantity,
} from "../../../../../shared/xenkitchen/kitchen";
import type { KitchenIngredient, KitchenItem, KitchenMethod, KitchenStep } from "../../../../hooks/xenkitchen/useKitchen";
import { CategoryIconView, MethodIconView } from "./kitchenIcons";

interface ItemViewProps {
  item: KitchenItem;
  /** Buttons shown beside the title (edit/share menu on the owner's page, clone on the public one). */
  actions?: ReactNode;
}

export default function ItemView({ item, actions }: ItemViewProps) {
  const theme = useTheme();
  const [cookMode, setCookMode] = useState(false);
  useWakeLock(cookMode);
  const accent = item.category?.color ?? theme.palette.primary.main;

  return (
    <Box>
      <Gallery item={item} accent={accent} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }} justifyContent="space-between" sx={{ mt: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          {item.category && (
            <Chip
              size="small"
              icon={<CategoryIconView icon={item.category.icon} sx={{ fontSize: 16 }} />}
              label={item.category.name}
              sx={{ mb: 1, bgcolor: alpha(accent, 0.15), color: "text.primary", "& .MuiChip-icon": { color: accent } }}
            />
          )}
          <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.15, wordBreak: "break-word" }}>
            {item.title || "Untitled"}
          </Typography>
          {item.brand && item.layout === "instructions" && (
            <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 0.5 }}>{item.brand}</Typography>
          )}
        </Box>
        {actions && <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>{actions}</Stack>}
      </Stack>

      {item.description && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5, whiteSpace: "pre-wrap" }}>{item.description}</Typography>
      )}

      {item.tags.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          {item.tags.map((t) => <Chip key={t} label={`#${t}`} size="small" variant="outlined" />)}
        </Stack>
      )}

      {item.layout === "instructions"
        ? <InstructionsSection item={item} accent={accent} />
        : <RecipeSection item={item} accent={accent} cookMode={cookMode} onCookMode={setCookMode} />}

      {item.notes && (
        <Card variant="outlined" sx={{ ...cardSx, p: 2.5, mt: 3 }}>
          <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1 }}>Notes</Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{item.notes}</Typography>
        </Card>
      )}
    </Box>
  );
}

// ---------- gallery ----------

function Gallery({ item, accent }: { item: KitchenItem; accent: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const images = item.images;

  if (images.length === 0) {
    return (
      <Box sx={{
        height: { xs: 140, sm: 180 }, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(135deg, ${alpha(accent, 0.35)} 0%, ${alpha(accent, 0.1)} 100%)`,
      }}>
        {item.layout === "instructions"
          ? <AcUnitIcon sx={{ fontSize: 64, color: alpha(accent, 0.9) }} />
          : <CategoryIconView icon={item.category?.icon} sx={{ fontSize: 64, color: alpha(accent, 0.9) }} />}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: images.length > 1 ? { xs: "1fr", sm: "2fr 1fr" } : "1fr" }}>
        <Box
          component="img"
          src={images[0].url}
          alt={item.title}
          onClick={() => setOpen(0)}
          sx={{ width: "100%", height: { xs: 240, sm: 360 }, objectFit: "cover", borderRadius: 3, cursor: "zoom-in", display: "block" }}
        />
        {images.length > 1 && (
          <Box sx={{ display: { xs: "flex", sm: "grid" }, gap: 1, gridTemplateRows: "1fr 1fr", overflowX: "auto" }}>
            {images.slice(1, 3).map((img, i) => (
              <Box key={img._id} sx={{ position: "relative", flex: "0 0 40%" }}>
                <Box
                  component="img"
                  src={img.url}
                  alt=""
                  onClick={() => setOpen(i + 1)}
                  sx={{ width: "100%", height: { xs: 100, sm: 176 }, objectFit: "cover", borderRadius: 3, cursor: "zoom-in", display: "block" }}
                />
                {i === 1 && images.length > 3 && (
                  <Box onClick={() => setOpen(2)} sx={{
                    position: "absolute", inset: 0, borderRadius: 3, bgcolor: "rgba(0,0,0,0.5)", color: "common.white",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontWeight: 700, fontSize: 20,
                  }}>
                    +{images.length - 3}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <Lightbox urls={images.map((i) => i.url)} index={open} onChange={setOpen} />
    </>
  );
}

export function Lightbox({ urls, index, onChange }: { urls: string[]; index: number | null; onChange: (i: number | null) => void }) {
  const go = (d: number) => index !== null && onChange((index + d + urls.length) % urls.length);
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <Dialog open={index !== null} onClose={() => onChange(null)} maxWidth="lg" fullWidth
      slotProps={{ paper: { sx: { bgcolor: "black", position: "relative" } } }}>
      {index !== null && (
        <Box sx={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <Box component="img" src={urls[index]} alt="" sx={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" }} />
          <IconButton aria-label="Close" onClick={() => onChange(null)} sx={{ position: "absolute", top: 8, right: 8, color: "common.white", bgcolor: "rgba(0,0,0,0.4)" }}>
            <CloseIcon />
          </IconButton>
          {urls.length > 1 && (
            <>
              <IconButton aria-label="Previous" onClick={() => go(-1)} sx={{ position: "absolute", left: 8, color: "common.white", bgcolor: "rgba(0,0,0,0.4)" }}><ChevronLeftIcon /></IconButton>
              <IconButton aria-label="Next" onClick={() => go(1)} sx={{ position: "absolute", right: 8, color: "common.white", bgcolor: "rgba(0,0,0,0.4)" }}><ChevronRightIcon /></IconButton>
            </>
          )}
        </Box>
      )}
    </Dialog>
  );
}

// ---------- recipe ----------

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ textAlign: "center", px: 1 }}>
      <Typography variant="caption" sx={{ ...sectionLabelSx }}>{label}</Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

function RecipeSection({ item, accent, cookMode, onCookMode }: {
  item: KitchenItem; accent: string; cookMode: boolean; onCookMode: (v: boolean) => void;
}) {
  const baseServings = item.servings || 0;
  const [servings, setServings] = useState(baseServings);
  useEffect(() => setServings(baseServings), [baseServings]);
  const factor = baseServings > 0 && servings > 0 ? servings / baseServings : 1;
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const toggle = (set: Set<number>, i: number) => { const n = new Set(set); if (n.has(i)) n.delete(i); else n.add(i); return n; };

  const groups = useMemo(() => {
    const out: Array<{ section: string; rows: Array<{ ing: KitchenIngredient; index: number }> }> = [];
    item.ingredients.forEach((ing, index) => {
      const section = ing.section || "";
      const last = out[out.length - 1];
      if (last && last.section === section) last.rows.push({ ing, index });
      else out.push({ section, rows: [{ ing, index }] });
    });
    return out;
  }, [item.ingredients]);

  const hasStats = baseServings || item.prep_minutes || item.cook_minutes;
  const total = (item.prep_minutes || 0) + (item.cook_minutes || 0);

  return (
    <>
      {hasStats ? (
        <Card variant="outlined" sx={{ ...cardSx, mt: 3, py: 1.5, display: "flex", justifyContent: "space-around", flexWrap: "wrap", rowGap: 1 }}>
          {item.prep_minutes ? <Stat label="Prep" value={formatMinutes(item.prep_minutes)} /> : null}
          {item.cook_minutes ? <Stat label="Cook" value={formatMinutes(item.cook_minutes)} /> : null}
          {item.prep_minutes && item.cook_minutes ? <Stat label="Total" value={formatMinutes(total)} /> : null}
          {baseServings ? (
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="caption" sx={{ ...sectionLabelSx }}>Servings</Typography>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <IconButton size="small" aria-label="Fewer servings" onClick={() => setServings((s) => Math.max(1, s - 1))}><RemoveIcon fontSize="small" /></IconButton>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, minWidth: 24, color: factor !== 1 ? accent : undefined }}>{servings}</Typography>
                <IconButton size="small" aria-label="More servings" onClick={() => setServings((s) => s + 1)}><AddIcon fontSize="small" /></IconButton>
              </Stack>
            </Box>
          ) : null}
        </Card>
      ) : null}

      <Box sx={{ display: "grid", gap: 3, mt: 3, gridTemplateColumns: { xs: "1fr", md: item.ingredients.length && item.steps.length ? "minmax(240px, 1fr) 2fr" : "1fr" } }}>
        {item.ingredients.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Ingredients</Typography>
              {factor !== 1 && (
                <Chip size="small" label={`× ${Math.round(factor * 100) / 100}`} onDelete={() => setServings(baseServings)} />
              )}
            </Stack>
            <Card variant="outlined" sx={{ ...cardSx, p: 1 }}>
              {groups.map((g, gi) => (
                <Box key={gi} sx={{ mt: gi && g.section ? 1.5 : 0 }}>
                  {g.section && (
                    <Typography variant="caption" sx={{ ...sectionLabelSx, px: 1, pt: 0.5 }}>{g.section}</Typography>
                  )}
                  {g.rows.map(({ ing, index }) => {
                    const done = checked.has(index);
                    const qty = scaleQuantity(ing.quantity, factor);
                    return (
                      <Box key={index} onClick={() => setChecked((s) => toggle(s, index))} sx={{
                        display: "flex", alignItems: "flex-start", gap: 0.5, px: 0.5, py: 0.25, borderRadius: 1.5, cursor: "pointer",
                        "&:hover": { bgcolor: "action.hover" },
                      }}>
                        <Checkbox size="small" checked={done} sx={{ p: 0.5, "&.Mui-checked": { color: accent } }} tabIndex={-1} />
                        <Typography variant="body2" sx={{ pt: 0.6, opacity: done ? 0.45 : 1, textDecoration: done ? "line-through" : "none" }}>
                          {(qty || ing.unit) && <Box component="span" sx={{ fontWeight: 700 }}>{[qty, ing.unit].filter(Boolean).join(" ")} </Box>}
                          {ing.name}
                          {ing.note && <Box component="span" sx={{ color: "text.secondary" }}>, {ing.note}</Box>}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Card>
          </Box>
        )}

        {item.steps.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Steps</Typography>
              <Tooltip title="Keeps your screen awake and makes steps easier to read">
                <FormControlLabel
                  control={<Switch size="small" checked={cookMode} onChange={(e) => onCookMode(e.target.checked)} />}
                  label={<Typography variant="body2">Cook mode</Typography>}
                  sx={{ mr: 0 }}
                />
              </Tooltip>
            </Stack>
            <Stack spacing={1.5}>
              {item.steps.map((step, i) => (
                <StepRow key={step._id ?? i} step={step} index={i} accent={accent} big={cookMode}
                  done={doneSteps.has(i)} onToggle={() => setDoneSteps((s) => toggle(s, i))} />
              ))}
            </Stack>
          </Box>
        )}
      </Box>
    </>
  );
}

function StepRow({ step, index, accent, big, done, onToggle }: {
  step: KitchenStep; index: number; accent: string; big: boolean; done: boolean; onToggle: () => void;
}) {
  return (
    <Card variant="outlined" sx={{ ...cardSx, p: big ? 2.5 : 2, display: "flex", gap: 2, opacity: done ? 0.55 : 1, transition: "opacity .2s" }}>
      <Box
        onClick={onToggle}
        role="button"
        aria-label={done ? "Mark step not done" : "Mark step done"}
        sx={{
          flexShrink: 0, width: big ? 40 : 32, height: big ? 40 : 32, borderRadius: "50%", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800,
          bgcolor: done ? accent : alpha(accent, 0.15), color: done ? "common.white" : "text.primary",
        }}
      >
        {done ? "✓" : index + 1}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant={big ? "h6" : "body1"} sx={{ whiteSpace: "pre-wrap", fontWeight: big ? 500 : 400, lineHeight: 1.5 }}>
          {step.text}
        </Typography>
        {step.timer_minutes ? <StepTimer minutes={step.timer_minutes} accent={accent} /> : null}
      </Box>
    </Card>
  );
}

/** A countdown chip. Beeps (and vibrates where supported) when it reaches zero. */
function StepTimer({ minutes, accent }: { minutes: number; accent: string }) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);

  useEffect(() => {
    if (!endAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [endAt]);

  const left = endAt ? Math.max(0, Math.round((endAt - now) / 1000)) : minutes * 60;
  useEffect(() => {
    if (endAt && left === 0 && !fired.current) {
      fired.current = true;
      navigator.vibrate?.([300, 150, 300]);
      try {
        const ctx = new AudioContext();
        [0, 0.35, 0.7].forEach((at) => {
          const o = ctx.createOscillator();
          o.frequency.value = 880;
          o.connect(ctx.destination);
          o.start(ctx.currentTime + at);
          o.stop(ctx.currentTime + at + 0.2);
        });
      } catch { /* no audio */ }
    }
  }, [endAt, left]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const finished = !!endAt && left === 0;
  return (
    <Chip
      icon={<TimerIcon />}
      size="small"
      clickable
      onClick={() => { fired.current = false; setNow(Date.now()); setEndAt(endAt && !finished ? null : Date.now() + minutes * 60_000); }}
      label={endAt ? (finished ? "Done! Tap to restart" : `${mm}:${ss} · tap to stop`) : `Start ${formatMinutes(minutes)} timer`}
      sx={{
        mt: 1, fontVariantNumeric: "tabular-nums",
        ...(endAt ? { bgcolor: finished ? "success.main" : alpha(accent, 0.25), color: finished ? "common.white" : undefined } : {}),
      }}
    />
  );
}

// ---------- instructions ----------

function InstructionsSection({ item, accent }: { item: KitchenItem; accent: string }) {
  return (
    <Box sx={{ mt: 3 }}>
      {item.methods.length === 0 ? (
        <Card variant="outlined" sx={{ ...cardSx, p: 3, textAlign: "center" }}>
          <RestaurantMenuIcon color="disabled" />
          <Typography variant="body2" color="text.secondary">No cooking directions yet — edit to add them from the photo.</Typography>
        </Card>
      ) : (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: item.methods.length > 1 ? "1fr 1fr" : "1fr" } }}>
          {item.methods.map((m, i) => <MethodCard key={m._id ?? i} m={m} accent={accent} />)}
        </Box>
      )}

      {item.storage_note && (
        <Card variant="outlined" sx={{ ...cardSx, p: 2, mt: 2, display: "flex", gap: 1.5, alignItems: "center", bgcolor: alpha(accent, 0.06) }}>
          <AcUnitIcon sx={{ color: accent }} />
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{item.storage_note}</Typography>
        </Card>
      )}
    </Box>
  );
}

function MethodCard({ m, accent }: { m: KitchenMethod; accent: string }) {
  const time = formatMinuteRange(m.minutes_min, m.minutes_max);
  return (
    <Card variant="outlined" sx={{ ...cardSx, overflow: "hidden" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, bgcolor: alpha(accent, 0.12) }}>
        <MethodIconView method={m.method} sx={{ color: accent }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>{COOK_METHOD_LABELS[m.method]}</Typography>
        {m.preheat && <Chip size="small" label="Preheat" color="warning" variant="outlined" />}
      </Stack>
      <Stack direction="row" divider={<Box sx={{ width: "1px", bgcolor: "divider" }} />} sx={{ px: 1, py: 2 }}>
        {(m.temp || m.power) ? (
          <Box sx={{ flex: 1, textAlign: "center" }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx }}>{m.temp ? "Temp" : "Power"}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{m.temp ? `${m.temp}°${m.temp_unit}` : m.power}</Typography>
          </Box>
        ) : null}
        {time && (
          <Box sx={{ flex: 1, textAlign: "center" }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx }}>Time</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{time.replace(" min", "")}<Typography component="span" variant="body2" color="text.secondary"> min</Typography></Typography>
          </Box>
        )}
      </Stack>
      {m.steps.length > 0 && (
        <Box component="ol" sx={{ m: 0, px: 2, pb: 2, pl: 4.5 }}>
          {m.steps.map((s, i) => (
            <Typography component="li" variant="body2" key={i} sx={{ mb: 0.5 }}>{s}</Typography>
          ))}
        </Box>
      )}
      {m.minutes_max ? <Box sx={{ px: 2, pb: 2 }}><StepTimer minutes={m.minutes_max} accent={accent} /></Box> : null}
    </Card>
  );
}
