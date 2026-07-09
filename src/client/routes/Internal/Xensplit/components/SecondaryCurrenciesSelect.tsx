import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
} from "@mui/material";
import { ALL_CURRENCIES, withoutCurrency } from "../../../../utils/currencyUtils";

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
  const options = withoutCurrency(ALL_CURRENCIES, primaryCurrency);

  return (
    <FormControl fullWidth disabled={disabled} size={size}>
      <InputLabel>{label}</InputLabel>
      <Select
        multiple
        value={value}
        label={label}
        onChange={(e) => {
          const next = e.target.value;
          onChange(typeof next === "string" ? next.split(",") : next);
        }}
        renderValue={(selected) => (selected.length > 0 ? selected.join(", ") : "None")}
      >
        {options.map((c) => (
          <MenuItem key={c} value={c}>
            <Checkbox checked={value.includes(c)} />
            <ListItemText primary={c} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
