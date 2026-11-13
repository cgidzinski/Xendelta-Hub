import { useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import TitleIcon from "@mui/icons-material/Title";
import { ingredientLine, parseIngredientLine } from "@shared/xenkitchen/kitchen";
import { useIngredientSuggestions } from "../../../../../hooks/xenkitchen/useKitchen";
import { IngredientRow, StepRow, Draft, newKey, moveIn, blankIngredient, blankStep } from "./itemDraft";
import { PasteDialog } from "./PasteDialog";
import { SectionTitle, quietInput } from "./editorFields";

export function RecipeFields({
  draft,
  set,
  accent,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  accent: string;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [menu, setMenu] = useState<{ el: HTMLElement; i: number } | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const rows = draft.ingredients;
  const setRows = (ingredients: IngredientRow[]) => set({ ingredients });
  const patchRow = (i: number, patch: Partial<IngredientRow>) =>
    setRows(rows.map((r, j) => (j === i ? ({ ...r, ...patch } as IngredientRow) : r)));

  const insertAfter = (i: number) => {
    const row = blankIngredient();
    setRows([...rows.slice(0, i + 1), row, ...rows.slice(i + 1)]);
    setFocusKey(row.key);
  };
  const removeAt = (i: number) => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blankIngredient()]);

  return (
    <Box sx={{ display: "grid", columnGap: 4, gridTemplateColumns: { md: "minmax(0, 1fr) minmax(0, 1.25fr)" } }}>
      <Box sx={{ minWidth: 0 }}>
        <SectionTitle
          action={
            <Button
              size="small"
              color="inherit"
              startIcon={<ContentPasteIcon fontSize="small" />}
              onClick={() => setPasteOpen(true)}
              sx={{ opacity: 0.7 }}
            >
              Paste list
            </Button>
          }
        >
          Ingredients
        </SectionTitle>
        <Stack spacing={0.25}>
          {rows.map((row, i) =>
            row.kind === "section" ? (
              <Stack key={row.key} direction="row" alignItems="center" sx={{ pt: i ? 1 : 0 }}>
                <TextField
                  variant="standard"
                  placeholder="Section, e.g. Sauce"
                  value={row.name}
                  fullWidth
                  onChange={(e) => patchRow(i, { name: e.target.value })}
                  sx={quietInput}
                  slotProps={{
                    htmlInput: {
                      maxLength: 60,
                      style: { fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13 },
                    },
                  }}
                />
                <IconButton size="small" onClick={() => removeAt(i)} aria-label="Remove section">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            ) : (
              <Stack
                key={row.key}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                  "& .row-more": { opacity: { sm: 0 } },
                  "&:hover .row-more, &:focus-within .row-more": { opacity: 1 },
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: accent, flexShrink: 0, opacity: 0.7 }} />
                <IngredientLineField
                  value={row.text}
                  autoFocus={focusKey === row.key}
                  onChange={(text) => patchRow(i, { text })}
                  onEnter={() => insertAfter(i)}
                  onBackspaceEmpty={() => {
                    if (rows.length > 1) removeAt(i);
                  }}
                />
                <IconButton
                  className="row-more"
                  size="small"
                  onClick={(e) => setMenu({ el: e.currentTarget, i })}
                  aria-label="Ingredient options"
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Stack>
            ),
          )}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => insertAfter(rows.length - 1)}>
            Ingredient
          </Button>
          <Button
            size="small"
            color="inherit"
            startIcon={<TitleIcon />}
            sx={{ opacity: 0.7 }}
            onClick={() => {
              const row = blankIngredient();
              setRows([...rows, { key: newKey(), kind: "section", name: "" }, row]);
            }}
          >
            Section
          </Button>
        </Stack>
        <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
          <MenuItem
            disabled={!menu || menu.i === 0}
            onClick={() => {
              if (menu) setRows(moveIn(rows, menu.i, -1));
              setMenu(null);
            }}
          >
            <ArrowUpwardIcon fontSize="small" sx={{ mr: 1 }} />
            Move up
          </MenuItem>
          <MenuItem
            disabled={!menu || menu.i === rows.length - 1}
            onClick={() => {
              if (menu) setRows(moveIn(rows, menu.i, 1));
              setMenu(null);
            }}
          >
            <ArrowDownwardIcon fontSize="small" sx={{ mr: 1 }} />
            Move down
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (menu) removeAt(menu.i);
              setMenu(null);
            }}
          >
            <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
            Remove
          </MenuItem>
        </Menu>
        <PasteDialog
          open={pasteOpen}
          onClose={() => setPasteOpen(false)}
          onAdd={(parsed) => {
            const kept = rows.filter((r) => r.kind === "section" || r.text.trim());
            setRows([
              ...kept,
              ...parsed.map((p) => ({ key: newKey(), kind: "ingredient" as const, text: ingredientLine(p) })),
            ]);
          }}
        />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <StepsEditor steps={draft.steps} onChange={(steps) => set({ steps })} accent={accent} />
      </Box>
    </Box>
  );
}

/**
 * One line per ingredient. Suggestions come from the name part of what's typed
 * ("2 cups gar" → garlic), and picking one keeps the amount and fills the usual unit.
 */
export function IngredientLineField({
  value,
  onChange,
  onEnter,
  onBackspaceEmpty,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const parsed = useMemo(() => parseIngredientLine(value) ?? { quantity: "", unit: "", name: "", note: "" }, [value]);
  const nameQuery = parsed.note ? "" : parsed.name.trim();
  // A word the parser doesn't know as a unit ("2 handfuls spinach") ends up in the name, so
  // also look up the name without its first word and offer those matches after the exact ones.
  const tailQuery = nameQuery.includes(" ") ? nameQuery.slice(nameQuery.indexOf(" ") + 1) : "";
  const { suggestions } = useIngredientSuggestions(nameQuery, focused && nameQuery.length > 0);
  const { suggestions: tailSuggestions } = useIngredientSuggestions(tailQuery, focused && tailQuery.length > 1);
  const options = useMemo(() => {
    const pick = (list: typeof suggestions, q: string) => {
      const lq = q.toLowerCase();
      return lq
        ? list.filter((s) => {
            const n = s.name.toLowerCase();
            return n.includes(lq) && n !== lq;
          })
        : [];
    };
    const seen = new Set<string>();
    return [...pick(suggestions, nameQuery), ...pick(tailSuggestions, tailQuery)]
      .filter((s) => {
        const k = s.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 8);
  }, [suggestions, tailSuggestions, nameQuery, tailQuery]);

  return (
    <Autocomplete
      freeSolo
      fullWidth
      size="small"
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
      inputValue={value}
      onInputChange={(_, v, reason) => {
        if (reason === "input" || reason === "clear") onChange(v);
      }}
      onChange={(_, v) => {
        if (v && typeof v !== "string") {
          // Matched on the tail ("handfuls spin" → spinach): the first word was really a unit.
          const viaTail = tailQuery && !v.name.toLowerCase().includes(nameQuery.toLowerCase());
          const lead = viaTail ? nameQuery.slice(0, nameQuery.indexOf(" ")) : "";
          onChange(
            ingredientLine({
              quantity: parsed.quantity,
              unit: parsed.unit || lead || v.unit,
              name: v.name,
              note: parsed.note,
            }),
          );
        }
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      renderOption={(props, o) => {
        const { key, ...rest } = props as any;
        return (
          <li key={key} {...rest}>
            <Stack direction="row" justifyContent="space-between" sx={{ width: "100%" }}>
              <span>{o.name}</span>
              <Typography variant="caption" color="text.secondary">
                {o.unit}
              </Typography>
            </Stack>
          </li>
        );
      }}
      renderInput={(p) => (
        <TextField
          {...p}
          variant="standard"
          autoFocus={autoFocus}
          placeholder="e.g. 2 cups flour, sifted"
          sx={quietInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.defaultPrevented && !(p.inputProps as any)["aria-activedescendant"]) {
              e.preventDefault();
              onEnter();
            }
            if (e.key === "Backspace" && !value) {
              e.preventDefault();
              onBackspaceEmpty();
            }
          }}
          slotProps={{ htmlInput: { ...p.inputProps, maxLength: 200, "aria-label": "Ingredient" } }}
        />
      )}
    />
  );
}

export function StepsEditor({
  steps,
  onChange,
  accent,
}: {
  steps: StepRow[];
  onChange: (s: StepRow[]) => void;
  accent: string;
}) {
  const patch = (i: number, p: Partial<StepRow>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const [timerFor, setTimerFor] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const insertAfter = (i: number) => {
    const row = blankStep();
    onChange([...steps.slice(0, i + 1), row, ...steps.slice(i + 1)]);
    setFocusKey(row.key);
  };

  return (
    <>
      <SectionTitle>Steps</SectionTitle>
      <Stack spacing={1}>
        {steps.map((s, i) => (
          <Stack
            key={s.key}
            direction="row"
            spacing={1.5}
            alignItems="flex-start"
            sx={{
              "& .row-more": { opacity: { sm: 0 } },
              "&:hover .row-more, &:focus-within .row-more": { opacity: 1 },
            }}
          >
            <Box
              sx={{
                width: 24,
                height: 24,
                mt: 0.5,
                borderRadius: "50%",
                bgcolor: alpha(accent, 0.18),
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TextField
                multiline
                fullWidth
                variant="standard"
                placeholder={i === 0 ? "First, …" : "Then…"}
                value={s.text}
                autoFocus={focusKey === s.key}
                onChange={(e) => patch(i, { text: e.target.value })}
                sx={quietInput}
                onKeyDown={(e) => {
                  // Enter starts the next step; Shift+Enter is a line break inside this one.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    insertAfter(i);
                  }
                  if (e.key === "Backspace" && !s.text && steps.length > 1) {
                    e.preventDefault();
                    onChange(steps.filter((_, j) => j !== i));
                  }
                }}
                slotProps={{ htmlInput: { maxLength: 2000, "aria-label": `Step ${i + 1}` } }}
              />
              {(s.timer || timerFor.has(s.key)) && (
                <TextField
                  size="small"
                  type="number"
                  placeholder="Timer"
                  value={s.timer}
                  onChange={(e) => patch(i, { timer: e.target.value })}
                  sx={{ mt: 0.5, width: 130 }}
                  autoFocus={!s.timer}
                  slotProps={{
                    htmlInput: { min: 0, "aria-label": "Timer minutes" },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <TimerOutlinedIcon fontSize="small" />
                        </InputAdornment>
                      ),
                      endAdornment: <InputAdornment position="end">min</InputAdornment>,
                    },
                  }}
                />
              )}
            </Box>
            <Stack direction="row" className="row-more">
              {!s.timer && !timerFor.has(s.key) && (
                <Tooltip title="Add a timer">
                  <IconButton size="small" onClick={() => setTimerFor((t) => new Set(t).add(s.key))}>
                    <TimerOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove step">
                <IconButton
                  size="small"
                  onClick={() => onChange(steps.length > 1 ? steps.filter((_, j) => j !== i) : [blankStep()])}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        ))}
      </Stack>
      <Button size="small" startIcon={<AddIcon />} sx={{ mt: 0.5 }} onClick={() => insertAfter(steps.length - 1)}>
        Step
      </Button>
    </>
  );
}
