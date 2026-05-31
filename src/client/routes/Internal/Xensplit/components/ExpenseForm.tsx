import React, { useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  InputAdornment,
} from "@mui/material";
import { SearchedUser } from "../../../../hooks/useUserSearch";

const ALL_CURRENCIES = ["CAD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "INR", "MXN", "BRL"];

function getSortedCurrencies(defaultCurrency?: string) {
  if (!defaultCurrency) return ALL_CURRENCIES;
  return [defaultCurrency, ...ALL_CURRENCIES.filter((c) => c !== defaultCurrency)];
}

interface ExpenseFormProps {
  title: string;
  onTitleChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  paidBy: string;
  onPaidByChange: (v: string) => void;
  splitType: "equal" | "exact" | "percent";
  onSplitTypeChange: (v: "equal" | "exact" | "percent") => void;
  selectedParticipants: SearchedUser[];
  onParticipantsChange: (v: SearchedUser[]) => void;
  exactSplits: { [userId: string]: string };
  onExactSplitsChange: (v: { [userId: string]: string }) => void;
  percentSplits: { [userId: string]: string };
  onPercentSplitsChange: (v: { [userId: string]: string }) => void;
  members: Array<{ user_id: string; username: string; avatar?: string | null }>;
  defaultCurrency?: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  loading?: boolean;
  paidByUser?: SearchedUser | null;
  onPaidByUserChange?: (user: SearchedUser | null) => void;
}

export default function ExpenseForm({
  title,
  onTitleChange,
  notes,
  onNotesChange,
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  paidBy,
  onPaidByChange,
  splitType,
  onSplitTypeChange,
  selectedParticipants,
  onParticipantsChange,
  exactSplits,
  onExactSplitsChange,
  percentSplits,
  onPercentSplitsChange,
  members,
  defaultCurrency,
  onSubmit,
  submitDisabled,
  submitLabel = "Add Expense",
  loading,
  paidByUser,
  onPaidByUserChange,
}: ExpenseFormProps) {
  const numAmount = parseFloat(amount) || 0;

  // Auto-populate splits when participants or amount change
  const prevParticipantsRef = React.useRef<SearchedUser[]>([]);
  useEffect(() => {
    // Only run if participants actually changed (not just re-render)
    const participantsChanged = prevParticipantsRef.current.length !== selectedParticipants.length ||
      !prevParticipantsRef.current.every((p, i) => p._id === selectedParticipants[i]?._id);

    if (selectedParticipants.length === 0 || !participantsChanged) return;

    const equalPercent = 100 / selectedParticipants.length;

    if (splitType === "exact" && numAmount > 0) {
      const newExactSplits: { [userId: string]: string } = {};
      selectedParticipants.forEach((p) => {
        newExactSplits[p._id] = (numAmount / selectedParticipants.length).toFixed(2);
      });
      onExactSplitsChange(newExactSplits);
    } else if (splitType === "percent") {
      const newPercentSplits: { [userId: string]: string } = {};
      selectedParticipants.forEach((p) => {
        newPercentSplits[p._id] = equalPercent.toFixed(1);
      });
      onPercentSplitsChange(newPercentSplits);
    }

    prevParticipantsRef.current = selectedParticipants;
  }, [selectedParticipants, splitType, numAmount]);

  const totalExact = Object.values(exactSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const totalPercent = Object.values(percentSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <TextField
        fullWidth
        margin="dense"
        label="Title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
      />

      <TextField
        fullWidth
        label="Notes"
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        multiline
        rows={2}
      />

      <Box sx={{ display: "flex", gap: 2, flexWrap: { xs: "wrap", sm: "nowrap" } }}>
        <TextField
          fullWidth
          label="Amount"
          type="number"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
        />
        <FormControl sx={{ width: { xs: "100%", sm: 110 } }}>
          <InputLabel>Currency</InputLabel>
          <Select
            value={currency}
            label="Currency"
            onChange={(e) => onCurrencyChange(e.target.value)}
          >
            {getSortedCurrencies(defaultCurrency).map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

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
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Paid by
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {members.map((member) => (
            <Box
              key={member.user_id}
              onClick={() => {
                onPaidByChange(paidBy === member.user_id ? "" : member.user_id);
                onPaidByUserChange?.({ _id: member.user_id, username: member.username, avatar: member.avatar });
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
                border: paidBy === member.user_id ? "2px solid" : "2px solid transparent",
                borderColor: paidBy === member.user_id ? "primary.main" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <Avatar src={member.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                {member.username[0]?.toUpperCase()}
              </Avatar>
              <Typography variant="caption">
                {member.username}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle2">Participants</Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              selectedParticipants.length === members.length
                ? onParticipantsChange([])
                : onParticipantsChange(members.map((m) => ({ _id: m.user_id, username: m.username, avatar: m.avatar })))
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
                    onParticipantsChange([...selectedParticipants, { _id: member.user_id, username: member.username, avatar: member.avatar }]);
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
                <Avatar src={member.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                  {member.username[0]?.toUpperCase()}
                </Avatar>
                <Typography variant="caption">
                  {member.username}
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
                {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(numAmount / selectedParticipants.length)} each
              </Typography>
            )
          ) : (
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="subtitle2">
                {splitType === "exact" ? "Exact amounts" : "Percentages"}
              </Typography>
              {splitType === "exact" && (
                <Typography variant="caption" color={Math.abs(totalExact - numAmount) < 0.01 ? "success" : "error"}>
                  Total: {totalExact.toFixed(2)} / {numAmount.toFixed(2)}
                </Typography>
              )}
              {splitType === "percent" && (
                <Typography variant="caption" color={Math.abs(totalPercent - 100) < 0.01 ? "success" : "error"}>
                  Total: {totalPercent === 0 ? "0" : totalPercent.toFixed(1)}% / 100%
                </Typography>
              )}
            </Box>
          )}
          {splitType !== "equal" && selectedParticipants.map((p) => (
            <Box key={p._id} sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
              <Avatar src={p.avatar || undefined} sx={{ width: 28, height: 28 }}>
                {p.username[0]?.toUpperCase()}
              </Avatar>
              <Typography variant="body2" sx={{ width: 100 }}>
                {p.username}
              </Typography>
              {splitType === "percent" ? (
                <TextField
                  size="small"
                  type="number"
                  value={percentSplits[p._id] || ""}
                  onChange={(e) => onPercentSplitsChange({ ...percentSplits, [p._id]: e.target.value })}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                  sx={{ flexGrow: 1 }}
                />
              ) : (
                <TextField
                  size="small"
                  type="number"
                  value={exactSplits[p._id] || ""}
                  onChange={(e) => onExactSplitsChange({ ...exactSplits, [p._id]: e.target.value })}
                  sx={{ flexGrow: 1 }}
                />
              )}
            </Box>
          ))}
        </Box>
      )}

      <Button
        fullWidth
        variant="contained"
        onClick={onSubmit}
        disabled={submitDisabled || loading}
        loading={loading}
        sx={{ mt: 1 }}
      >
        {submitLabel}
      </Button>
    </Box>
  );
}