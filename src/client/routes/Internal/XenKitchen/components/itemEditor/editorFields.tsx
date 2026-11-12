import { useState } from "react";
import { Autocomplete, Stack, TextField, Typography } from "@mui/material";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { normalizeTag } from "@shared/xenkitchen/kitchen";
import { useKitchenTags } from "../../../../../hooks/xenkitchen/useKitchen";

// Borderless, roomy inputs: the editor reads like a page, not a form.
export const quietInput = {
  "& .MuiInput-underline:before": { borderBottomColor: "transparent" },
  "& .MuiInput-underline:hover:not(.Mui-disabled):before": { borderBottomColor: "divider" },
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
