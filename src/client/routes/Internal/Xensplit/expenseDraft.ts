import { useCallback, useMemo, useState } from "react";
import type { SearchedUser } from "../../../hooks/useUserSearch";
import type {
  RecurringFrequency,
  XenSplitExpense,
  XenSplitMember,
  XenSplitRecurringSeries,
} from "../../../hooks/xensplit/types";

// The values of the add / edit expense dialogs. Both dialogs hold the same fields, so they share
// one shape, one hook, and the pure helpers below (which are what the tests cover).

export type SplitType = "equal" | "exact" | "percent";

export interface ExpenseDraft {
  title: string;
  notes: string;
  amount: string;
  currency: string;
  paidBy: string;
  paidByUser: SearchedUser | null;
  splitType: SplitType;
  participants: SearchedUser[];
  exactSplits: Record<string, string>;
  percentSplits: Record<string, string>;
  date: Date;
  category: string;
  onHold: boolean;
  isRecurring: boolean;
  frequency: RecurringFrequency;
  recurringEndDate: Date | null;
  maxOccurrences: string;
  seriesActive: boolean;
  images: File[];
}

export const emptyDraft = (overrides: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  title: "",
  notes: "",
  amount: "",
  currency: "CAD",
  paidBy: "",
  paidByUser: null,
  splitType: "equal",
  participants: [],
  exactSplits: {},
  percentSplits: {},
  date: new Date(),
  category: "",
  onHold: false,
  isRecurring: false,
  frequency: "monthly",
  recurringEndDate: null,
  maxOccurrences: "",
  seriesActive: true,
  images: [],
  ...overrides,
});

const asParticipant = (m: Pick<XenSplitMember, "user_id" | "username" | "avatar">): SearchedUser => ({
  _id: m.user_id,
  username: m.username,
  avatar: m.avatar,
});

/** Fill the edit dialog from a saved expense (and the recurring series it starts, if any). */
export function draftFromExpense(
  expense: XenSplitExpense,
  members: XenSplitMember[],
  series?: XenSplitRecurringSeries,
): ExpenseDraft {
  const payer = members.find((m) => m.user_id === expense.paid_by);
  const draft = emptyDraft({
    title: expense.title || "",
    notes: expense.notes || "",
    amount: expense.amount.toString(),
    currency: expense.currency,
    paidBy: expense.paid_by,
    paidByUser: payer ? asParticipant(payer) : null,
    splitType: expense.split_type as SplitType,
    date: expense.date ? new Date(expense.date) : new Date(),
    category: expense.category || "",
    // Hold isn't available while recurring: saving a genesis clears any stale hold
    onHold: series ? false : (expense.on_hold ?? false),
    isRecurring: !!series,
    frequency: series?.frequency ?? "monthly",
    recurringEndDate: series?.end_date ? new Date(series.end_date) : null,
    maxOccurrences: series?.max_occurrences ? series.max_occurrences.toString() : "",
    seriesActive: series?.active ?? true,
  });

  if (expense.splits && expense.splits.length > 0) {
    draft.participants = expense.splits
      .map((s) => members.find((m) => m.user_id === s.user_id))
      .filter((m): m is XenSplitMember => !!m)
      .map(asParticipant);
    for (const s of expense.splits) {
      if (expense.split_type === "exact" && s.amount_owed !== undefined)
        draft.exactSplits[s.user_id] = s.amount_owed.toString();
      else if (expense.split_type === "percent" && s.percentage !== undefined)
        draft.percentSplits[s.user_id] = s.percentage.toString();
    }
  }
  return draft;
}

/** The `splits` an expense is sent with for the draft's split type. */
export function splitsFor(d: Pick<ExpenseDraft, "splitType" | "participants" | "exactSplits" | "percentSplits">) {
  if (d.splitType === "equal") return d.participants.map((p) => ({ user_id: p._id }));
  if (d.splitType === "exact")
    return d.participants.map((p) => ({ user_id: p._id, amount_owed: parseFloat(d.exactSplits[p._id] || "0") }));
  return d.participants.map((p) => ({ user_id: p._id, percentage: parseFloat(d.percentSplits[p._id] || "0") }));
}

const sum = (values: Record<string, string>) =>
  Object.values(values).reduce((total, v) => total + (parseFloat(v) || 0), 0);

/** Whether exact amounts add up to the total, and percentages to 100 (only checked for that split type). */
export function splitValidity(
  d: Pick<ExpenseDraft, "splitType" | "participants" | "amount" | "exactSplits" | "percentSplits">,
) {
  const none = d.participants.length === 0;
  return {
    exactOk: d.splitType !== "exact" || none || Math.abs(sum(d.exactSplits) - (parseFloat(d.amount) || 0)) < 0.01,
    percentOk: d.splitType !== "percent" || none || Math.abs(sum(d.percentSplits) - 100) < 0.01,
  };
}

/** Enough to submit: a title, an amount, a payer, and splits that add up. */
export function canSubmit(d: ExpenseDraft): boolean {
  const { exactOk, percentOk } = splitValidity(d);
  return !!d.title.trim() && !!d.amount && !!d.paidBy && exactOk && percentOk;
}

type Setter<K extends keyof ExpenseDraft> = (
  value: ExpenseDraft[K] | ((prev: ExpenseDraft[K]) => ExpenseDraft[K]),
) => void;
export type DraftSetters = { [K in keyof ExpenseDraft]: Setter<K> };

const KEYS = Object.keys(emptyDraft()) as Array<keyof ExpenseDraft>;

export interface ExpenseDraftState {
  values: ExpenseDraft;
  /** One stable setter per field, usable as `onTitleChange={draft.setters.title}`. */
  setters: DraftSetters;
  reset: (next: ExpenseDraft) => void;
}

export function useExpenseDraft(): ExpenseDraftState {
  const [values, setValues] = useState<ExpenseDraft>(() => emptyDraft());
  const setters = useMemo(() => {
    const out = {} as Record<string, unknown>;
    for (const key of KEYS) {
      out[key] = (value: unknown) =>
        setValues((prev) => ({
          ...prev,
          [key]: typeof value === "function" ? (value as (p: unknown) => unknown)(prev[key]) : value,
        }));
    }
    return out as DraftSetters;
  }, []);
  const reset = useCallback((next: ExpenseDraft) => setValues(next), []);
  return { values, setters, reset };
}

/** The ExpenseForm props that come straight from a draft (values and their setters). */
export function expenseFormProps({ values: v, setters: s }: ExpenseDraftState) {
  return {
    title: v.title,
    onTitleChange: s.title,
    notes: v.notes,
    onNotesChange: s.notes,
    amount: v.amount,
    onAmountChange: s.amount,
    currency: v.currency,
    onCurrencyChange: s.currency,
    paidBy: v.paidBy,
    onPaidByChange: s.paidBy,
    paidByUser: v.paidByUser,
    onPaidByUserChange: s.paidByUser,
    splitType: v.splitType,
    onSplitTypeChange: s.splitType,
    selectedParticipants: v.participants,
    onParticipantsChange: s.participants,
    exactSplits: v.exactSplits,
    onExactSplitsChange: s.exactSplits,
    percentSplits: v.percentSplits,
    onPercentSplitsChange: s.percentSplits,
    images: v.images,
    onImagesChange: s.images,
    date: v.date,
    onDateChange: s.date,
    category: v.category,
    onCategoryChange: s.category,
    onHold: v.onHold,
    onOnHoldChange: s.onHold,
    isRecurring: v.isRecurring,
    onIsRecurringChange: s.isRecurring,
    frequency: v.frequency,
    onFrequencyChange: s.frequency,
    recurringEndDate: v.recurringEndDate,
    onRecurringEndDateChange: s.recurringEndDate,
    maxOccurrences: v.maxOccurrences,
    onMaxOccurrencesChange: s.maxOccurrences,
    seriesActive: v.seriesActive,
    onSeriesActiveChange: s.seriesActive,
  };
}
