import React from "react";
import { Box, Typography, Button, TextField, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { getCurrencySymbol, sanitizeAmount, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import UserName from "../../../../components/user/UserName";
import UserAvatar from "../../../../components/user/UserAvatar";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import type { ExpenseFormProps } from "./ExpenseForm";

export interface ExpenseDetailsStepProps extends Pick<
  ExpenseFormProps,
  | "title"
  | "onTitleChange"
  | "currency"
  | "onCurrencyChange"
  | "currencyOptions"
  | "amount"
  | "onAmountChange"
  | "date"
  | "onDateChange"
  | "members"
  | "paidBy"
  | "onPaidByChange"
  | "onPaidByUserChange"
  | "isEditing"
> {
  recurringOn: boolean;
  recurringMode: NonNullable<ExpenseFormProps["recurringMode"]>;
  receiptScanEnabled: boolean;
  startReceiptScan: () => void;
  scanInputRef: React.RefObject<HTMLInputElement | null>;
  handleScanPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Step 1 of the expense form: title, amount, currency, date and who paid. */
export default function ExpenseDetailsStep({
  title,
  onTitleChange,
  currency,
  onCurrencyChange,
  currencyOptions,
  amount,
  onAmountChange,
  date,
  onDateChange,
  members,
  paidBy,
  onPaidByChange,
  onPaidByUserChange,
  isEditing,
  recurringOn,
  recurringMode,
  receiptScanEnabled,
  startReceiptScan,
  scanInputRef,
  handleScanPhoto,
}: ExpenseDetailsStepProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
      {receiptScanEnabled && !isEditing && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            p: 1.5,
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 180 }}>
            Have a receipt? Scan it to fill in the title, total and who had what.
          </Typography>
          <Button variant="outlined" size="small" startIcon={<ReceiptLongIcon />} onClick={startReceiptScan}>
            Scan a receipt
          </Button>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleScanPhoto}
          />
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <TextField
          fullWidth
          margin="dense"
          label="Title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 2 }}>
        <FormControl sx={{ flex: 1 }}>
          <InputLabel>Currency</InputLabel>
          <Select
            value={currency}
            label="Currency"
            onChange={(e) => onCurrencyChange(e.target.value)}
            MenuProps={STABLE_CURRENCY_MENU_PROPS}
          >
            {currencyOptions.map((c) => (
              <MenuItem key={c} value={c}>
                {c} ({getCurrencySymbol(c)})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Amount"
          value={amount}
          onChange={(e) => {
            const v = sanitizeAmount(e.target.value);
            if (v !== null) onAmountChange(v);
          }}
          onBlur={() => {
            const n = parseFloat(amount);
            if (!isNaN(n)) onAmountChange(n.toFixed(2));
          }}
          slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
          sx={{ flex: 1 }}
        />
      </Box>

      <DateTimePicker
        label={recurringOn ? "Starts" : "Date & Time"}
        value={date}
        onChange={(d) => d && onDateChange(d)}
        disabled={recurringMode === "editSeries"}
        slotProps={{
          textField: {
            fullWidth: true,
            helperText:
              recurringMode === "editSeries" ? "Locked while recurring — cancel recurrence to change it" : undefined,
          },
        }}
      />

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
                onPaidByUserChange?.({
                  _id: member.user_id,
                  username: member.username,
                  avatar: member.avatar ?? null,
                  cosmetics: member.cosmetics,
                });
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
              <UserAvatar user={member} sx={{ width: 24, height: 24, fontSize: 12 }}>
                {member.username[0]?.toUpperCase()}
              </UserAvatar>
              <Typography variant="caption">
                <UserName user={member} />
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
