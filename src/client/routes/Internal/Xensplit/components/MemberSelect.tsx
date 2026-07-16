import { Box, Typography, Avatar, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import type { XenSplitMember } from "../../../../hooks/xensplit/types";
import { STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";

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
                            <Avatar src={m.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                                {m.username[0]?.toUpperCase()}
                            </Avatar>
                            <Typography variant="body2">{m.username}</Typography>
                        </Box>
                    );
                }}
            >
                {options.map((m) => (
                    <MenuItem key={m.user_id} value={m.user_id}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Avatar src={m.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                                {m.username[0]?.toUpperCase()}
                            </Avatar>
                            <Typography variant="body2">{m.username}</Typography>
                        </Box>
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}
