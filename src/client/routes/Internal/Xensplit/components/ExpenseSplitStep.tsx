import { formatMoney } from "@shared/money";
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from "@mui/material";
import UserName from "../../../../components/user/UserName";
import UserAvatar from "../../../../components/user/UserAvatar";
import type { ExpenseFormProps } from "./ExpenseForm";

export interface ExpenseSplitStepProps extends Pick<
  ExpenseFormProps,
  | "splitType"
  | "onSplitTypeChange"
  | "selectedParticipants"
  | "members"
  | "onParticipantsChange"
  | "currency"
  | "percentSplits"
  | "onPercentSplitsChange"
  | "exactSplits"
  | "onExactSplitsChange"
> {
  numAmount: number;
  totalExact: number;
  totalPercent: number;
  handleSplitChange: (id: string, raw: string, type: "exact" | "percent") => void;
}

/** Step 2 of the expense form: who is in the split and how it is divided. */
export default function ExpenseSplitStep({
  splitType,
  onSplitTypeChange,
  selectedParticipants,
  members,
  onParticipantsChange,
  numAmount,
  currency,
  totalExact,
  totalPercent,
  percentSplits,
  handleSplitChange,
  onPercentSplitsChange,
  exactSplits,
  onExactSplitsChange,
}: ExpenseSplitStepProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FormControl fullWidth>
        <InputLabel>Split type</InputLabel>
        <Select
          value={splitType}
          label="Split type"
          onChange={(e) => onSplitTypeChange(e.target.value as "equal" | "exact" | "percent")}
        >
          <MenuItem value="equal">Equal</MenuItem>
          <MenuItem value="exact">Exact amounts</MenuItem>
          <MenuItem value="percent">By percentage</MenuItem>
        </Select>
      </FormControl>

      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle2">Participants</Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              selectedParticipants.length === members.length
                ? onParticipantsChange([])
                : onParticipantsChange(
                    members.map((m) => ({
                      _id: m.user_id,
                      username: m.username,
                      avatar: m.avatar ?? null,
                      cosmetics: m.cosmetics,
                    })),
                  )
            }
          >
            {selectedParticipants.length === members.length ? "Clear" : "Everyone"}
          </Button>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {members.map((member) => {
            const isSelected = selectedParticipants.some((p) => p._id === member.user_id);
            return (
              <Box
                key={member.user_id}
                onClick={() => {
                  if (isSelected) {
                    onParticipantsChange(selectedParticipants.filter((p) => p._id !== member.user_id));
                  } else {
                    onParticipantsChange([
                      ...selectedParticipants,
                      {
                        _id: member.user_id,
                        username: member.username,
                        avatar: member.avatar ?? null,
                        cosmetics: member.cosmetics,
                      },
                    ]);
                  }
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  cursor: "pointer",
                  bgcolor: "action.hover",
                  color: "text.primary",
                  border: isSelected ? "2px solid" : "2px solid transparent",
                  borderColor: isSelected ? "primary.main" : "transparent",
                  transition: "all 0.2s",
                }}
              >
                <UserAvatar user={member} sx={{ width: 24, height: 24, fontSize: 12 }}>
                  {member.username[0]?.toUpperCase()}
                </UserAvatar>
                <Typography variant="caption">
                  <UserName user={member} />
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {selectedParticipants.length > 0 && (
        <Box>
          {splitType === "equal" ? (
            numAmount > 0 && (
              <Typography variant="caption" color="text.secondary">
                {formatMoney(numAmount / selectedParticipants.length, currency, { locale: null })} each
              </Typography>
            )
          ) : (
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="subtitle2">{splitType === "exact" ? "Exact amounts" : "Percentages"}</Typography>
              {splitType === "exact" && (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <Typography variant="caption" color={Math.abs(totalExact - numAmount) < 0.01 ? "success" : "error"}>
                    Total: {totalExact.toFixed(2)} / {numAmount.toFixed(2)}
                  </Typography>
                  <Typography
                    variant="caption"
                    color={Math.abs(totalExact - numAmount) < 0.01 ? "success" : "text.secondary"}
                  >
                    Remainder: {(numAmount - totalExact).toFixed(2)}
                  </Typography>
                </Box>
              )}
              {splitType === "percent" && (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <Typography variant="caption" color={Math.abs(totalPercent - 100) < 0.01 ? "success" : "error"}>
                    Total: {totalPercent === 0 ? "0" : totalPercent.toFixed(2)}% / 100%
                  </Typography>
                  <Typography
                    variant="caption"
                    color={Math.abs(totalPercent - 100) < 0.01 ? "success" : "text.secondary"}
                  >
                    Remainder: {(100 - totalPercent).toFixed(2)}%
                  </Typography>
                </Box>
              )}
            </Box>
          )}
          {splitType !== "equal" &&
            selectedParticipants.map((p) => (
              <Box
                key={p._id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "28px auto 1fr",
                  alignItems: "center",
                  columnGap: 2,
                  mb: 1,
                }}
              >
                <UserAvatar user={p} sx={{ width: 28, height: 28 }}>
                  {p.username[0]?.toUpperCase()}
                </UserAvatar>
                <Typography variant="body2" noWrap>
                  <UserName user={p} />
                </Typography>
                {splitType === "percent" ? (
                  <TextField
                    size="small"
                    value={percentSplits[p._id] || ""}
                    onChange={(e) => handleSplitChange(p._id, e.target.value, "percent")}
                    onBlur={() => {
                      const n = parseFloat(percentSplits[p._id]);
                      if (!isNaN(n)) onPercentSplitsChange({ ...percentSplits, [p._id]: n.toFixed(2) });
                    }}
                    slotProps={{
                      htmlInput: { inputMode: "decimal" },
                      input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                    }}
                    sx={{}}
                  />
                ) : (
                  <TextField
                    size="small"
                    value={exactSplits[p._id] || ""}
                    onChange={(e) => handleSplitChange(p._id, e.target.value, "exact")}
                    onBlur={() => {
                      const n = parseFloat(exactSplits[p._id]);
                      if (!isNaN(n)) onExactSplitsChange({ ...exactSplits, [p._id]: n.toFixed(2) });
                    }}
                    slotProps={{ htmlInput: { inputMode: "decimal" } }}
                    sx={{}}
                  />
                )}
              </Box>
            ))}
        </Box>
      )}
    </Box>
  );
}
