import React, { useEffect, useRef } from "react";
import PWAImageCapture from "../../../../pwa/components/PWAImageCapture";
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
  Stepper,
  Step,
  StepLabel,
  IconButton,
  CircularProgress,
  alpha,
  Switch,
} from "@mui/material";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import { SearchedUser } from "../../../../hooks/useUserSearch";
import type { XenSplitExpenseImage } from "../../../../hooks/xensplit/types";
import { getSortedCurrencies, getCurrencySymbol } from "../../../../utils/currencyUtils";
import { EXPENSE_CATEGORIES } from "../../../../constants/xensplit";
import { getCategoryIcon } from "../../../../constants/xensplitCategoryIcons";
import { xsBadgeSx } from "./rowStyles";

const MAX_IMAGES = 10;

const STEPS = ["Details", "Split", "Misc"];

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
  // Image props
  images: File[];
  onImagesChange: (files: File[]) => void;
  existingImages?: XenSplitExpenseImage[];
  existingImageUrls?: { _id: string; signedUrl: string }[];
  onDeleteExistingImage?: (imageId: string) => void;
  isDeletingImage?: boolean;
  isEditing?: boolean;
  date: Date;
  onDateChange: (d: Date) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  onHold: boolean;
  onOnHoldChange: (v: boolean) => void;
  /** "free" = group creator (bidirectional), "oneWay" = expense creator (hold→unhold only), "hidden" = no access */
  holdMode?: "free" | "oneWay" | "hidden";
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
  submitLabel = "Confirm",
  loading,
  paidByUser,
  onPaidByUserChange,
  images,
  onImagesChange,
  existingImages = [],
  existingImageUrls = [],
  onDeleteExistingImage,
  isDeletingImage,
  isEditing = false,
  date,
  onDateChange,
  category,
  onCategoryChange,
  onHold,
  onOnHoldChange,
  holdMode = "hidden",
}: ExpenseFormProps) {
  const [step, setStep] = React.useState(0);
  const objectUrlsRef = useRef<string[]>([]);
  // Tracks split boxes the user has typed in, so untouched boxes can absorb the remainder
  const editedSplitIdsRef = useRef<Set<string>>(new Set());

  const numAmount = parseFloat(amount) || 0;
  const CategoryIconComponent = getCategoryIcon(category);

  // Accepts only digits and a single decimal separator (comma normalized to dot).
  // Returns the sanitized string, or null if the keystroke should be rejected.
  const sanitizeAmount = (raw: string): string | null => {
    const normalized = raw.replace(/,/g, ".");
    if (!/^\d*\.?\d*$/.test(normalized)) return null;
    return normalized;
  };

  // Fills the untouched split boxes with an even share of the remainder when a box is edited.
  const handleSplitChange = (id: string, raw: string, type: "exact" | "percent") => {
    const v = sanitizeAmount(raw);
    if (v === null) return;
    editedSplitIdsRef.current.add(id);
    const current = type === "exact" ? exactSplits : percentSplits;
    const next = { ...current, [id]: v };
    const total = type === "exact" ? numAmount : 100;
    const edited = editedSplitIdsRef.current;
    const editedSum = selectedParticipants.reduce(
      (s, p) => (edited.has(p._id) ? s + (parseFloat(next[p._id]) || 0) : s),
      0
    );
    const uneditedIds = selectedParticipants.filter((p) => !edited.has(p._id)).map((p) => p._id);
    if (uneditedIds.length > 0) {
      const per = Math.max(0, (total - editedSum) / uneditedIds.length);
      uneditedIds.forEach((uid) => {
        next[uid] = per.toFixed(2);
      });
    }
    if (type === "exact") onExactSplitsChange(next);
    else onPercentSplitsChange(next);
  };

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Auto-populate splits when participants or amount change
  const prevParticipantsRef = React.useRef<SearchedUser[]>([]);
  const isFirstRunRef = React.useRef(true);
  useEffect(() => {
    // On initial mount when editing, skip auto-populate so existing split values are preserved
    if (isEditing && isFirstRunRef.current) {
      isFirstRunRef.current = false;
      prevParticipantsRef.current = selectedParticipants;
      return;
    }
    isFirstRunRef.current = false;

    const participantsChanged =
      prevParticipantsRef.current.length !== selectedParticipants.length ||
      !prevParticipantsRef.current.every((p, i) => p._id === selectedParticipants[i]?._id);

    if (selectedParticipants.length === 0 || !participantsChanged) return;

    // The baseline is about to be re-evened, so forget any manual edits
    editedSplitIdsRef.current = new Set();

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
        newPercentSplits[p._id] = equalPercent.toFixed(2);
      });
      onPercentSplitsChange(newPercentSplits);
    }

    prevParticipantsRef.current = selectedParticipants;
  }, [selectedParticipants, splitType, numAmount]);

  // Reset manual-edit tracking when the split type changes
  useEffect(() => {
    editedSplitIdsRef.current = new Set();
  }, [splitType]);

  const totalExact = Object.values(exactSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const totalPercent = Object.values(percentSplits).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  const totalImageCount = existingImages.length + images.length;
  const canAddMoreImages = totalImageCount < MAX_IMAGES;

  const step1NextDisabled = !title.trim() || !amount || !paidBy;
  const step2NextDisabled = selectedParticipants.length === 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = MAX_IMAGES - totalImageCount;
    const toAdd = files.slice(0, remaining);
    toAdd.forEach((f) => {
      const url = URL.createObjectURL(f);
      objectUrlsRef.current.push(url);
    });
    onImagesChange([...images, ...toAdd]);
    // Reset input so same file can be re-added if removed
    e.target.value = "";
  }

  function handleRemoveNewImage(index: number) {
    const removed = images[index];
    // Find and revoke the object URL for this file
    const url = URL.createObjectURL(removed);
    URL.revokeObjectURL(url);
    onImagesChange(images.filter((_, i) => i !== index));
  }

  // Get preview URL for a new file (stable across renders via index-based cache)
  const previewUrls = React.useMemo(() => {
    return images.map((f) => URL.createObjectURL(f));
  }, [images]);

  // Revoke on images change
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stepper activeStep={step} alternativeLabel sx={{ mb: 1 }}>
        {STEPS.map((label, index) => (
          <Step key={label}>
            <StepLabel
              onClick={isEditing ? () => setStep(index) : undefined}
              sx={isEditing ? { cursor: "pointer" } : undefined}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 1: Details */}
      {step === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
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
              >
                {getSortedCurrencies(defaultCurrency).map((c) => (
                  <MenuItem key={c} value={c}>{c} ({getCurrencySymbol(c)})</MenuItem>
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
            label="Date & Time"
            value={date}
            onChange={(d) => d && onDateChange(d)}
            slotProps={{ textField: { fullWidth: true } }}
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
                    onPaidByUserChange?.({ _id: member.user_id, username: member.username, avatar: member.avatar ?? null });
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
                  <Typography variant="caption">{member.username}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {/* Step 2: Split */}
      {step === 1 && (
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
                      members.map((m) => ({ _id: m.user_id, username: m.username, avatar: m.avatar ?? null }))
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
                          { _id: member.user_id, username: member.username, avatar: member.avatar ?? null },
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
                    <Avatar src={member.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                      {member.username[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="caption">{member.username}</Typography>
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
                    {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
                      numAmount / selectedParticipants.length
                    )}{" "}
                    each
                  </Typography>
                )
              ) : (
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="subtitle2">
                    {splitType === "exact" ? "Exact amounts" : "Percentages"}
                  </Typography>
                  {splitType === "exact" && (
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <Typography
                        variant="caption"
                        color={Math.abs(totalExact - numAmount) < 0.01 ? "success" : "error"}
                      >
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
                      <Typography
                        variant="caption"
                        color={Math.abs(totalPercent - 100) < 0.01 ? "success" : "error"}
                      >
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
                  <Box key={p._id} sx={{ display: "grid", gridTemplateColumns: "28px auto 1fr", alignItems: "center", columnGap: 2, mb: 1 }}>
                    <Avatar src={p.avatar || undefined} sx={{ width: 28, height: 28 }}>
                      {p.username[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="body2" noWrap>
                      {p.username}
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
      )}

      {/* Step 3: Misc */}
      {step === 2 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {holdMode !== "hidden" && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                py: 1.25,
                borderRadius: 2,
                border: "1px solid",
                borderColor: onHold ? "warning.main" : "divider",
                bgcolor: (t) => onHold ? alpha(t.palette.warning.main, 0.08) : "transparent",
                transition: "all 0.2s",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                <PauseCircleOutlineIcon
                  sx={{ fontSize: 22, color: onHold ? "warning.main" : "text.secondary" }}
                />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                    On Hold
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: "block" }}>
                    {holdMode === "oneWay" && onHold
                      ? "Removing hold is permanent — cannot be re-applied"
                      : "Exclude from balance calculations"}
                  </Typography>
                </Box>
              </Box>
              <Switch
                checked={onHold}
                onChange={(e) => onOnHoldChange(e.target.checked)}
                disabled={holdMode === "oneWay" && !onHold}
                color="warning"
                size="small"
              />
            </Box>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Avatar sx={{ bgcolor: "grey.800", width: 40, height: 40 }}>
              <CategoryIconComponent sx={{ fontSize: 20, color: "text.secondary" }} />
            </Avatar>
            <FormControl fullWidth>
              <InputLabel>Category (optional)</InputLabel>
              <Select
                value={category}
                label="Category (optional)"
                onChange={(e) => onCategoryChange(e.target.value)}
              >
                <MenuItem value=""><em>None</em></MenuItem>
                {EXPENSE_CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <TextField
            fullWidth
            label="Notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value.slice(0, 1000))}
            multiline
            rows={2}
            inputProps={{ maxLength: 1000 }}
            helperText={`${notes.length}/1000`}
          />

          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <Typography variant="subtitle2">
                Photos ({totalImageCount} / {MAX_IMAGES})
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                10MB max
              </Typography>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {/* Existing images (from DB) */}
              {existingImages.map((img) => {
                const urlEntry = existingImageUrls.find((u) => u._id === img._id);
                return (
                  <Box
                    key={img._id}
                    sx={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}
                  >
                    {urlEntry ? (
                      <Box
                        component="img"
                        src={urlEntry.signedUrl}
                        sx={{
                          width: 80,
                          height: 80,
                          objectFit: "cover",
                          borderRadius: 1,
                          display: "block",
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 80,
                          height: 80,
                          bgcolor: "action.hover",
                          borderRadius: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CircularProgress size={20} />
                      </Box>
                    )}
                    <IconButton
                      size="small"
                      disabled={isDeletingImage}
                      onClick={() => onDeleteExistingImage?.(img._id)}
                      sx={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        bgcolor: "rgba(0,0,0,0.55)",
                        color: "white",
                        p: 0.25,
                        "&:hover": { bgcolor: "rgba(0,0,0,0.75)" },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                );
              })}

              {/* New images (pending upload) */}
              {previewUrls.map((url, index) => (
                <Box
                  key={url}
                  sx={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}
                >
                  <Box
                    component="img"
                    src={url}
                    sx={{
                      width: 80,
                      height: 80,
                      objectFit: "cover",
                      borderRadius: 1,
                      display: "block",
                      opacity: 0.8,
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveNewImage(index)}
                    sx={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      bgcolor: "rgba(0,0,0,0.55)",
                      color: "white",
                      p: 0.25,
                      "&:hover": { bgcolor: "rgba(0,0,0,0.75)" },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              ))}

              {canAddMoreImages && <PWAImageCapture onChange={handleFileChange} />}
            </Box>
          </Box>
        </Box>
      )}

      {/* Navigation */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
        <Button
          variant="outlined"
          sx={{ visibility: step === 0 ? "hidden" : "visible" }}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </Button>

        {step < 2 ? (
          <Button
            variant="contained"
            disabled={step === 0 ? step1NextDisabled : step2NextDisabled}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        ) : (
          <>
            <Button
              variant="contained"
              onClick={onSubmit}
              disabled={submitDisabled || loading}
              loading={loading}
            >
              {submitLabel}
            </Button>
            {/* Delete Expense button removed; now only in dialog header */}
          </>
        )}
      </Box>
    </Box>
  );
}

