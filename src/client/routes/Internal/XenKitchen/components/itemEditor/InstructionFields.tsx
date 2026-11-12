import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import { COOK_METHODS, COOK_METHOD_LABELS, type CookMethod } from "@shared/xenkitchen/kitchen";

import { MethodIconView } from "../kitchenIcons";
import { MethodRow, Draft, blankMethod } from "./itemDraft";
import { SectionTitle } from "./editorFields";

// ---------- box instructions fields ----------

export function InstructionFields({
  draft,
  set,
  accent,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  accent: string;
}) {
  const methods = draft.methods;
  const patch = (i: number, p: Partial<MethodRow>) =>
    set({ methods: methods.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const used = new Set(methods.map((m) => m.method));
  const nextMethod = COOK_METHODS.find((m) => !used.has(m)) ?? "other";
  const [stepsOpen, setStepsOpen] = useState<Set<string>>(new Set());

  return (
    <>
      <SectionTitle>How to cook it</SectionTitle>
      <Stack spacing={1.5}>
        {methods.map((m, i) => {
          const showSteps = !!m.stepsText.trim() || stepsOpen.has(m.key);
          return (
            <Box
              key={m.key}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: alpha(accent, 0.07),
                border: "1px solid",
                borderColor: alpha(accent, 0.25),
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <TextField
                  select
                  size="small"
                  value={m.method}
                  onChange={(e) =>
                    patch(i, {
                      method: e.target.value as CookMethod,
                      preheat: e.target.value === "oven" ? m.preheat : false,
                    })
                  }
                  sx={{ minWidth: 150 }}
                  slotProps={{
                    htmlInput: { "aria-label": "Method" },
                    select: {
                      renderValue: (v) => (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <MethodIconView method={v as CookMethod} sx={{ fontSize: 18, color: accent }} />
                          <span>{COOK_METHOD_LABELS[v as CookMethod]}</span>
                        </Stack>
                      ),
                    },
                  }}
                >
                  {COOK_METHODS.map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      <MethodIconView method={opt} sx={{ fontSize: 18, mr: 1.5 }} />
                      {COOK_METHOD_LABELS[opt]}
                    </MenuItem>
                  ))}
                </TextField>

                {m.method === "microwave" ? (
                  <TextField
                    size="small"
                    placeholder="Power"
                    value={m.power}
                    onChange={(e) => patch(i, { power: e.target.value })}
                    sx={{ width: 110 }}
                    slotProps={{ htmlInput: { maxLength: 30, "aria-label": "Power" } }}
                  />
                ) : (
                  <TextField
                    size="small"
                    placeholder="Temp"
                    type="number"
                    value={m.temp}
                    onChange={(e) => patch(i, { temp: e.target.value })}
                    sx={{ width: 120 }}
                    slotProps={{
                      htmlInput: { min: 0, inputMode: "numeric", "aria-label": "Temperature" },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title="Switch °F / °C">
                              <Box
                                component="button"
                                type="button"
                                onClick={() => patch(i, { temp_unit: m.temp_unit === "F" ? "C" : "F" })}
                                sx={{
                                  border: 0,
                                  bgcolor: "transparent",
                                  color: "text.secondary",
                                  cursor: "pointer",
                                  font: "inherit",
                                  p: 0,
                                }}
                              >
                                °{m.temp_unit}
                              </Box>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}

                <Stack direction="row" spacing={0.5} alignItems="center">
                  <TextField
                    size="small"
                    placeholder="Min"
                    type="number"
                    value={m.minutes_min}
                    onChange={(e) => patch(i, { minutes_min: e.target.value })}
                    sx={{ width: 72 }}
                    slotProps={{ htmlInput: { min: 0, inputMode: "numeric", "aria-label": "Minutes from" } }}
                  />
                  <Typography color="text.secondary">–</Typography>
                  <TextField
                    size="small"
                    placeholder="Max"
                    type="number"
                    value={m.minutes_max}
                    onChange={(e) => patch(i, { minutes_max: e.target.value })}
                    sx={{ width: 72 }}
                    slotProps={{ htmlInput: { min: 0, inputMode: "numeric", "aria-label": "Minutes to" } }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    min
                  </Typography>
                </Stack>

                {m.method !== "microwave" && (
                  <Chip
                    size="small"
                    label="Preheat"
                    variant={m.preheat ? "filled" : "outlined"}
                    color={m.preheat ? "warning" : "default"}
                    onClick={() => patch(i, { preheat: !m.preheat })}
                  />
                )}
                <Box sx={{ flex: 1 }} />
                {!showSteps && (
                  <Button
                    size="small"
                    color="inherit"
                    sx={{ opacity: 0.7 }}
                    onClick={() => setStepsOpen((s) => new Set(s).add(m.key))}
                  >
                    + Steps
                  </Button>
                )}
                <IconButton
                  size="small"
                  aria-label="Remove method"
                  onClick={() =>
                    set({ methods: methods.length > 1 ? methods.filter((_, j) => j !== i) : [blankMethod()] })
                  }
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
              {showSteps && (
                <TextField
                  sx={{ mt: 1.5 }}
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  placeholder={"One per line, e.g.\nRemove film\nLet stand 2 minutes"}
                  value={m.stepsText}
                  onChange={(e) => patch(i, { stepsText: e.target.value })}
                  autoFocus={!m.stepsText}
                  slotProps={{ htmlInput: { "aria-label": "Steps" } }}
                />
              )}
            </Box>
          );
        })}
      </Stack>
      {methods.length < 6 && (
        <Button
          size="small"
          startIcon={<AddIcon />}
          sx={{ mt: 0.5 }}
          onClick={() => set({ methods: [...methods, blankMethod(nextMethod)] })}
        >
          Another way to cook it
        </Button>
      )}
    </>
  );
}
