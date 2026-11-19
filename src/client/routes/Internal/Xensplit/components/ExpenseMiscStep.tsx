import React from "react";
import PWAImageCapture from "../../../../pwa/components/PWAImageCapture";
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  IconButton,
  CircularProgress,
  alpha,
  Switch,
  Collapse,
} from "@mui/material";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import RepeatIcon from "@mui/icons-material/Repeat";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import CloseIcon from "@mui/icons-material/Close";
import type { XenSplitExpenseImage, RecurringFrequency } from "../../../../hooks/xensplit/types";
import { EXPENSE_CATEGORIES } from "../../../../constants/xensplit";
import { getCategoryIcon, getCategoryColor } from "../../../../constants/xensplitCategoryIcons";
import { xsBadgeSx } from "./rowStyles";
import type { ExpenseFormProps } from "./ExpenseForm";

export const MAX_IMAGES = 10;

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export interface ExpenseMiscStepProps extends Pick<
  ExpenseFormProps,
  | "onHold"
  | "onOnHoldChange"
  | "onIsRecurringChange"
  | "onFrequencyChange"
  | "onRecurringEndDateChange"
  | "onMaxOccurrencesChange"
  | "onSeriesActiveChange"
  | "category"
  | "onCategoryChange"
  | "notes"
  | "onNotesChange"
  | "isDeletingImage"
  | "onDeleteExistingImage"
> {
  existingImages: XenSplitExpenseImage[];
  existingImageUrls: NonNullable<ExpenseFormProps["existingImageUrls"]>;
  holdMode: NonNullable<ExpenseFormProps["holdMode"]>;
  recurringOn: boolean;
  recurringMode: NonNullable<ExpenseFormProps["recurringMode"]>;
  isRecurring: boolean;
  frequency: RecurringFrequency;
  recurringEndDate: Date | null;
  autoResumeOnBoundsEdit: () => void;
  maxOccurrences: string;
  seriesActive: boolean;
  seriesEnded: boolean;
  seriesWasInactive: boolean;
  hidePhotos: boolean;
  totalImageCount: number;
  previewUrls: string[];
  handleRemoveNewImage: (index: number) => void;
  canAddMoreImages: boolean;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Step 3 of the expense form: hold, recurrence, category, notes and photos. */
export default function ExpenseMiscStep({
  holdMode,
  onHold,
  recurringOn,
  onOnHoldChange,
  recurringMode,
  isRecurring,
  onIsRecurringChange,
  frequency,
  onFrequencyChange,
  recurringEndDate,
  onRecurringEndDateChange,
  autoResumeOnBoundsEdit,
  maxOccurrences,
  onMaxOccurrencesChange,
  seriesActive,
  seriesEnded,
  seriesWasInactive,
  onSeriesActiveChange,
  category,
  onCategoryChange,
  notes,
  onNotesChange,
  hidePhotos,
  totalImageCount,
  existingImages,
  existingImageUrls,
  isDeletingImage,
  onDeleteExistingImage,
  previewUrls,
  handleRemoveNewImage,
  canAddMoreImages,
  handleFileChange,
}: ExpenseMiscStepProps) {
  const CategoryIconComponent = getCategoryIcon(category);
  return (
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
            bgcolor: (t) => (onHold ? alpha(t.palette.warning.main, 0.08) : "transparent"),
            opacity: recurringOn ? 0.5 : 1,
            transition: "all 0.2s",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            <PauseCircleOutlineIcon sx={{ fontSize: 22, color: onHold ? "warning.main" : "text.secondary" }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                On Hold
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: "block" }}>
                {recurringOn
                  ? "Not available for recurring expenses — pause the schedule instead"
                  : holdMode === "oneWay" && onHold
                    ? "Removing hold is permanent — cannot be re-applied"
                    : "Exclude from balance calculations"}
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={onHold}
            onChange={(e) => onOnHoldChange(e.target.checked)}
            disabled={recurringOn || (holdMode === "oneWay" && !onHold)}
            color="warning"
            size="small"
          />
        </Box>
      )}
      {recurringMode !== "off" && (
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderRadius: 2,
            border: "1px solid",
            borderColor: recurringOn ? "secondary.main" : "divider",
            bgcolor: (t) => (recurringOn ? alpha(t.palette.secondary.main, 0.08) : "transparent"),
            transition: "all 0.2s",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              <RepeatIcon sx={{ fontSize: 22, color: recurringOn ? "secondary.main" : "text.secondary" }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                  Recurring
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: "block" }}>
                  {recurringMode === "editSeries" && !isRecurring
                    ? "Will stop recurring when saved — existing expenses are kept"
                    : "Automatically re-add this expense on a schedule"}
                </Typography>
              </Box>
            </Box>
            <Switch
              checked={isRecurring}
              onChange={(e) => {
                onIsRecurringChange?.(e.target.checked);
                if (e.target.checked) onOnHoldChange(false); // hold is per-expense; recurring series use Pause
              }}
              color="secondary"
              size="small"
            />
          </Box>
          <Collapse in={recurringOn}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Repeats</InputLabel>
                <Select
                  value={frequency}
                  label="Repeats"
                  onChange={(e) => onFrequencyChange?.(e.target.value as RecurringFrequency)}
                  disabled={recurringMode === "editSeries"}
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <MenuItem key={f.value} value={f.value}>
                      {f.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <DateTimePicker
                label="Ends (optional)"
                value={recurringEndDate}
                onChange={(d) => {
                  onRecurringEndDateChange?.(d);
                  autoResumeOnBoundsEdit();
                }}
                slotProps={{ textField: { fullWidth: true, size: "small" }, field: { clearable: true } }}
              />
              <TextField
                fullWidth
                size="small"
                label="Max occurrences (optional)"
                value={maxOccurrences}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  onMaxOccurrencesChange?.(v);
                  autoResumeOnBoundsEdit();
                }}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
                helperText="Total number of expenses, including the first"
              />
              {recurringMode === "editSeries" && (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                      {seriesActive ? "Active" : seriesEnded ? "Ended" : "Paused"}
                    </Typography>
                    {seriesActive && seriesWasInactive ? (
                      <Typography variant="caption" sx={{ lineHeight: 1.3, display: "block", color: "warning.main" }}>
                        Saving restarts the schedule — occurrences missed since it stopped will be added
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: "block" }}>
                        {seriesActive
                          ? "Occurrences are being created on schedule"
                          : seriesEnded
                            ? "Extend the end date or count to restart"
                            : "Resuming will backfill any missed occurrences"}
                      </Typography>
                    )}
                  </Box>
                  <Switch
                    checked={seriesActive}
                    onChange={(e) => onSeriesActiveChange?.(e.target.checked)}
                    color="secondary"
                    size="small"
                  />
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Avatar sx={{ ...xsBadgeSx, bgcolor: alpha(getCategoryColor(category), 0.15), lineHeight: 1 }}>
          <CategoryIconComponent sx={{ fontSize: 22, color: getCategoryColor(category) }} />
        </Avatar>
        <FormControl fullWidth>
          <InputLabel>Category (optional)</InputLabel>
          <Select value={category} label="Category (optional)" onChange={(e) => onCategoryChange(e.target.value)}>
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
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

      {hidePhotos ? (
        <Typography variant="caption" color="text.secondary">
          Photos can be added once the first expense is created on the start date.
        </Typography>
      ) : (
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
                <Box key={img._id} sx={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
                  {urlEntry ? (
                    <Box
                      component="img"
                      src={urlEntry.thumbUrl ?? urlEntry.signedUrl}
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
              <Box key={url} sx={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
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
      )}
    </Box>
  );
}
