import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
} from "@mui/material";
import { ALL_CURRENCIES, withoutCurrency, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";

interface SecondaryCurrenciesSelectProps {
  primaryCurrency: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
  size?: "small" | "medium";
}

export default function SecondaryCurrenciesSelect({
  primaryCurrency,
  value,
  onChange,
  disabled,
  label = "Secondary Currencies",
  size,
}: SecondaryCurrenciesSelectProps) {
  return (
    <FormControl fullWidth disabled={disabled} size={size}>
      {label && <InputLabel>{label}</InputLabel>}
      <Select
        multiple
        value={value}
        label={label || undefined}
        onChange={(e) => {
          const next = e.target.value;
          onChange(withoutCurrency(typeof next === "string" ? next.split(",") : next, primaryCurrency));
        }}
        renderValue={(selected) => (selected.length > 0 ? selected.join(", ") : "None")}
        sx={{ "& .MuiSelect-select": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }}
        MenuProps={{ ...STABLE_CURRENCY_MENU_PROPS, PaperProps: { sx: { maxHeight: 300 } } }}
      >
        {ALL_CURRENCIES.map((c) => {
          const isPrimary = c === primaryCurrency;
          return (
            <MenuItem key={c} value={c} disabled={isPrimary}>
              <Checkbox checked={!isPrimary && value.includes(c)} disabled={isPrimary} />
              <ListItemText primary={c} secondary={isPrimary ? "Primary currency" : undefined} />
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
}
