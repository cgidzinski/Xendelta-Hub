import type { Cosmetics } from "@shared/cosmetics";
import UploadProgress from "../../../../components/ui/UploadProgress";
import React, { useEffect, useRef } from "react";
import { Box, Button, Stepper, Step, StepLabel } from "@mui/material";
import { SearchedUser } from "../../../../hooks/people/usePeople";
import type { XenSplitExpenseImage, RecurringFrequency } from "../../../../hooks/xensplit/types";
import { sanitizeAmount } from "../../../../utils/currencyUtils";
import ReceiptScanDialog, { type ReceiptResult } from "./ReceiptScanDialog";
import { useReceiptScanEnabled } from "../../../../hooks/xensplit/useReceiptScan";
import ExpenseDetailsStep from "./ExpenseDetailsStep";
import ExpenseSplitStep from "./ExpenseSplitStep";
import ExpenseMiscStep, { MAX_IMAGES } from "./ExpenseMiscStep";

const STEPS = ["Details", "Split", "Misc"];

export interface ExpenseFormProps {
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
  members: Array<{ user_id: string; username: string; avatar?: string | null; cosmetics?: Cosmetics }>;
  currencyOptions: string[];
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  loading?: boolean;
  /** 0-100 while photos are uploading, null otherwise. */
  uploadPercent?: number | null;
  paidByUser?: SearchedUser | null;
  onPaidByUserChange?: (user: SearchedUser | null) => void;
  // Image props
  images: File[];
  onImagesChange: (files: File[]) => void;
  existingImages?: XenSplitExpenseImage[];
  existingImageUrls?: { _id: string; signedUrl: string; thumbUrl: string | null }[];
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
  /** "off" hides recurrence entirely; "create" offers the toggle; "editSeries" edits a genesis expense's schedule */
  recurringMode?: "off" | "create" | "editSeries";
  isRecurring?: boolean;
  onIsRecurringChange?: (v: boolean) => void;
  frequency?: RecurringFrequency;
  onFrequencyChange?: (v: RecurringFrequency) => void;
  recurringEndDate?: Date | null;
  onRecurringEndDateChange?: (d: Date | null) => void;
  maxOccurrences?: string;
  onMaxOccurrencesChange?: (v: string) => void;
  seriesActive?: boolean;
  onSeriesActiveChange?: (v: boolean) => void;
  /** The series was retired by its own end date / max count (editSeries mode). */
  seriesEnded?: boolean;
  /** The series was not running when the dialog opened (paused or ended). */
  seriesWasInactive?: boolean;
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
  currencyOptions,
  onSubmit,
  submitDisabled,
  submitLabel = "Confirm",
  loading,
  uploadPercent = null,
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
  recurringMode = "off",
  isRecurring = false,
  onIsRecurringChange,
  frequency = "monthly",
  onFrequencyChange,
  recurringEndDate = null,
  onRecurringEndDateChange,
  maxOccurrences = "",
  onMaxOccurrencesChange,
  seriesActive = true,
  onSeriesActiveChange,
  seriesEnded = false,
  seriesWasInactive = false,
}: ExpenseFormProps) {
  const [step, setStep] = React.useState(0);
  const receiptScanEnabled = useReceiptScanEnabled();
  const [scanOpen, setScanOpen] = React.useState(false);
  const [scanPhoto, setScanPhoto] = React.useState<File | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const recurringOn = recurringMode !== "off" && isRecurring;
  // Editing the bounds of an ended series restarts it — the warning below the
  // Active switch tells the user what that means
  const autoResumeOnBoundsEdit = () => {
    if (recurringMode === "editSeries" && seriesEnded && !seriesActive) onSeriesActiveChange?.(true);
  };
  // A future-start recurring series has no expense yet, so there's nothing to attach photos to
  const hidePhotos = recurringMode === "create" && recurringOn && date.getTime() > Date.now();
  const objectUrlsRef = useRef<string[]>([]);
  // Tracks split boxes the user has typed in, so untouched boxes can absorb the remainder
  const editedSplitIdsRef = useRef<Set<string>>(new Set());

  // Fill the form from a read receipt: each person's share becomes an exact amount.
  const applyReceipt = (r: ReceiptResult) => {
    const people = members.filter((m) => r.owed[m.user_id] !== undefined);
    if (r.title) onTitleChange(r.title);
    onAmountChange(String(r.amount));
    onCurrencyChange(r.currency);
    if (r.date) onDateChange(new Date(`${r.date}T12:00:00`));
    onSplitTypeChange("exact");
    onParticipantsChange(
      people.map((m) => ({ _id: m.user_id, username: m.username, avatar: m.avatar, cosmetics: m.cosmetics })),
    );
    onExactSplitsChange(Object.fromEntries(people.map((m) => [m.user_id, String(r.owed[m.user_id])])));
    // Every box already has its value, so a later edit must not treat any as "untouched" and overwrite it.
    editedSplitIdsRef.current = new Set(people.map((m) => m.user_id));
    setScanOpen(false);
  };

  const numAmount = parseFloat(amount) || 0;

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
      0,
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

  // Scan a receipt from the start: reuse a photo that is already attached, or ask for one (it is attached too, so it
  // is kept on the expense). The result fills in the title, total, date and who owes what.
  function startReceiptScan() {
    if (images[0]) {
      setScanPhoto(images[0]);
      setScanOpen(true);
    } else {
      scanInputRef.current?.click();
    }
  }

  function handleScanPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (canAddMoreImages) onImagesChange([...images, file]);
    setScanPhoto(file);
    setScanOpen(true);
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
        <ExpenseDetailsStep
          {...{
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
          }}
        />
      )}

      {/* Step 2: Split */}
      {step === 1 && (
        <ExpenseSplitStep
          {...{
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
          }}
        />
      )}

      {/* Step 3: Misc */}
      {step === 2 && (
        <ExpenseMiscStep
          {...{
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
          }}
        />
      )}

      <ReceiptScanDialog
        open={scanOpen}
        photo={scanPhoto}
        members={members}
        currency={currency}
        currencyOptions={currencyOptions}
        onClose={() => setScanOpen(false)}
        onApply={applyReceipt}
      />

      <UploadProgress percent={uploadPercent} label="photos" />

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
            <Button variant="contained" onClick={onSubmit} disabled={submitDisabled || loading} loading={loading}>
              {submitLabel}
            </Button>
            {/* Delete Expense button removed; now only in dialog header */}
          </>
        )}
      </Box>
    </Box>
  );
}
