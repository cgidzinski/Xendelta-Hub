import { Box, Typography, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import type { XenSplitMember } from "../../../../hooks/xensplit/types";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import UserName from "../../../../components/user/UserName";
import UserAvatar from "../../../../components/user/UserAvatar";

interface MemberSelectProps {
  members: XenSplitMember[];
  label: string;
  value: string;
  excludeId: string;
  onChange: (id: string) => void;
}

export function MemberSelect({ members, label, value, excludeId, onChange }: MemberSelectProps) {
  const options = members.filter((m) => m.user_id !== excludeId);
  const labelId = `member-select-${label.toLowerCase().replace(/\s+/g, "-")}-label`;
  return (
    <FormControl fullWidth>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        MenuProps={STABLE_CURRENCY_MENU_PROPS}
        renderValue={(val) => {
          const m = options.find((mem) => mem.user_id === val);
          if (!m) return "";
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <UserAvatar user={m} sx={{ width: 24, height: 24, fontSize: 12 }}>
                {m.username[0]?.toUpperCase()}
              </UserAvatar>
              <Typography variant="body2">
                <UserName user={m} />
              </Typography>
            </Box>
          );
        }}
      >
        {options.map((m) => (
          <MenuItem key={m.user_id} value={m.user_id}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <UserAvatar user={m} sx={{ width: 24, height: 24, fontSize: 12 }}>
                {m.username[0]?.toUpperCase()}
              </UserAvatar>
              <Typography variant="body2">
                <UserName user={m} />
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
