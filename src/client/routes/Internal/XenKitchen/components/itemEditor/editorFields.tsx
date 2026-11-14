import { useState } from "react";
import { Autocomplete, Stack, TextField, Typography } from "@mui/material";
import { RADIUS } from "../../../../../theme";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { normalizeTag } from "@shared/xenkitchen/kitchen";
import { useKitchenTags } from "../../../../../hooks/xenkitchen/useKitchen";

// Roomy inputs so the editor reads like a page, not a form. On phones they are borderless; from sm up
// a faint resting underline shows each line is a field you can type in.
export const quietInput = {
  "& .MuiInput-underline:before": { borderBottomColor: { xs: "transparent", sm: "divider" } },
  "& .MuiInput-underline:hover:not(.Mui-disabled):before": { borderBottomColor: "text.secondary" },
} as const;

// An editable row (an ingredient, a step): a soft tint on hover and while typing, and its buttons
// (`.row-more`) faint at rest on desktop, full on hover or focus. Phones always show them.
export const editableRowSx = {
  borderRadius: RADIUS.md,
  px: { sm: 0.5 },
  mx: { sm: -0.5 },
  transition: "background-color 120ms",
  "&:hover, &:focus-within": { bgcolor: { sm: "action.hover" } },
  "& .row-more": { opacity: { sm: 0.35 }, transition: "opacity 120ms" },
  "&:hover .row-more, &:focus-within .row-more": { opacity: 1 },
} as const;

// ---------- tags ----------

export function TagField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { tags } = useKitchenTags();
  const [input, setInput] = useState("");
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={tags.map((t) => t.tag).filter((t) => !value.includes(t))}
      value={value}
      inputValue={input}
      onInputChange={(_, v) => {
        // A comma finishes a tag, like most tag inputs.
        if (v.endsWith(",")) {
          const t = normalizeTag(v.slice(0, -1));
          if (t && !value.includes(t)) onChange([...value, t]);
          setInput("");
        } else setInput(v);
      }}
      onChange={(_, v) => onChange([...new Set((v as string[]).map(normalizeTag).filter(Boolean))])}
      renderInput={(p) => <TextField {...p} label="Tags" placeholder={value.length ? "" : "quick, vegetarian…"} />}
    />
  );
}

// ---------- recipe fields ----------

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 3, mb: 0.5 }}>
      <Typography variant="caption" sx={{ ...sectionLabelSx, color: "text.secondary" }}>
        {children}
      </Typography>
      {action}
    </Stack>
  );
}
