import type { EtransferInfo } from "../../../shared/etransfer";

export type { EtransferInfo };

export interface XenSplitMember {
  user_id: string;
  username: string;
  avatar: string | null;
  etransfer: EtransferInfo | null;
  joined_at: string;
}

export interface XenSplitExpenseSplit {
  user_id: string;
  amount_owed?: number;
  percentage?: number;
}

export interface XenSplitExpenseImage {
  _id: string;
  gcs_path: string;
}

export interface XenSplitExpense {
  _id: string;
  paid_by: string;
  created_by?: string;
  amount: number;
  currency: string;
  title: string;
  notes?: string;
  category?: string;
  date: string;
  split_type: "equal" | "exact" | "percent";
  splits: XenSplitExpenseSplit[];
  images?: XenSplitExpenseImage[];
  on_hold?: boolean;
  recurring_id?: string;
  // Absent on expenses written before this field joined the schema: a Mongoose default
  // applies at creation, not retroactively to existing subdocuments. Callers ordering by
  // "when it was added" fall back to `date`.
  /** Set when soft-deleted; null or absent means live. See shared/xensplit/softDelete.ts. */
  deleted_at?: string | null;
  deleted_by?: string;
  created_at?: string;
  payer?: {
    user_id: string;
    username: string;
    avatar: string | null;
  } | null;
}

export type RecurringFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface XenSplitRecurringSeries {
  _id: string;
  genesis_expense_id?: string;
  pending_expense?: Partial<XenSplitExpense>;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string;
  max_occurrences?: number;
  active: boolean;
  occurrence_count: number;
  next_run_at: string;
  last_generated_at?: string;
  created_by?: string;
  created_at: string;
}

export interface XenSplitSettlement {
  _id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  settled_at: string;
  note?: string;
  /** Set when soft-deleted; null or absent means live. See shared/xensplit/softDelete.ts. */
  deleted_at?: string | null;
  deleted_by?: string;
}

export interface XenSplitExchange {
  _id: string;
  party_a: string;
  currency_a: string;
  amount_a: number;
  party_b: string;
  currency_b: string;
  amount_b: number;
  rate: number;
  rate_from_currency?: string;
  created_by?: string;
  note?: string;
  date: string;
  created_at: string;
  /** Set when soft-deleted; null or absent means live. See shared/xensplit/softDelete.ts. */
  deleted_at?: string | null;
  deleted_by?: string;
}

export interface XenSplit {
  _id: string;
  name: string;
  default_currency: string;
  secondary_currencies: string[];
  image_url?: string;
  created_by: string;
  created_at: string;
  members: XenSplitMember[];
  expenses: XenSplitExpense[];
  settlements: XenSplitSettlement[];
  exchanges: XenSplitExchange[];
  recurring_expenses?: XenSplitRecurringSeries[];
  /**
   * Soft-deleted records, split out of the arrays above by the query `select` so every
   * consumer of `expenses`/`settlements`/`exchanges` sees live records only. Present
   * only on a group that came through useXenSplit/useXenSplitGroups.
   */
  deleted?: {
    expenses: XenSplitExpense[];
    settlements: XenSplitSettlement[];
    exchanges: XenSplitExchange[];
  };
}

export interface XenSplitBalance {
  user: {
    _id: string;
    username: string;
    avatar: string | null;
  };
  balances: {
    [currency: string]: number;
  };
}

export interface XenSplitSettlementTransfer {
  from: string;
  to: string;
  amount: number;
  currency: string;
  fromUser: {
    _id: string;
    username: string;
    avatar: string | null;
    etransfer: EtransferInfo | null;
  };
  toUser: {
    _id: string;
    username: string;
    avatar: string | null;
    etransfer: EtransferInfo | null;
  };
}

export interface XenSplitBalancesData {
  group: {
    _id: string;
    name: string;
  };
  balances: {
    [userId: string]: XenSplitBalance;
  };
  settlements: XenSplitSettlementTransfer[];
}

// A raw, un-simplified debt between two members for a single currency,
// derived directly from shared expenses (before the greedy meshing).
export interface DirectDebt {
  from: string;
  to: string;
  amount: number;
  currency: string;
}

// One signed line item explaining a member's net balance in a currency.
// The sum of `amount` across all lines equals the member's net balance.
export interface BreakdownLine {
  kind: "paid" | "share" | "settlement" | "exchange";
  label: string;
  hint?: string; // short plain-language explanation of the line's direction
  amount: number; // signed: positive increases balance (owed to them), negative decreases
  date?: string;
}

export interface CreateExpenseInput {
  paid_by: string;
  amount: number;
  currency: string;
  title: string;
  notes?: string;
  category?: string;
  date?: string;
  split_type: "equal" | "exact" | "percent";
  splits?: XenSplitExpenseSplit[];
  on_hold?: boolean;
  recurring?: {
    frequency: RecurringFrequency;
    end_date?: string;
    max_occurrences?: number;
  };
}

export interface CreateXenSplitInput {
  name: string;
  memberIds?: string[];
  default_currency?: string;
  secondary_currencies?: string[];
}

export interface UpdateExpenseInput {
  paid_by?: string;
  amount?: number;
  currency?: string;
  title?: string;
  notes?: string;
  category?: string;
  date?: string;
  split_type?: "equal" | "exact" | "percent";
  splits?: XenSplitExpenseSplit[];
  on_hold?: boolean;
  recurring?: {
    end_date?: string | null;
    max_occurrences?: number | null;
    active?: boolean;
    cancel?: true;
  };
}

export interface SettleDebtInput {
  from: string;
  to: string;
  amount: number;
  currency: string;
  note?: string;
}

export interface CreateExchangeInput {
  party_a: string;
  currency_a: string;
  amount_a: number;
  party_b: string;
  currency_b: string;
  rate: number;
  rate_from_currency?: string;
  note?: string;
  date?: string;
}
export type XenSplitLogAction =
  | "group_created" | "group_updated" | "group_image_updated" | "ownership_transferred"
  | "member_added" | "member_removed"
  | "expense_created" | "expense_updated" | "expense_deleted" | "expense_restored"
  | "expense_images_added" | "expense_image_removed"
  | "recurring_scheduled" | "recurring_generated" | "recurring_cancelled" | "recurring_paused"
  | "recurring_resumed" | "recurring_updated"
  | "settlement_created" | "settlement_deleted" | "settlement_restored"
  | "exchange_created" | "exchange_deleted" | "exchange_restored";

export interface XenSplitLogChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface XenSplitLogEntry {
  _id: string;
  /** null for system actions (recurring occurrences generated by the scheduler) */
  actor_id: string | null;
  action: XenSplitLogAction;
  target_type?: "group" | "member" | "expense" | "settlement" | "exchange" | "recurring";
  target_id?: string;
  summary?: string;
  meta?: Record<string, any>;
  changes: XenSplitLogChange[];
  created_at: string;
}

export interface XenSplitLogPage {
  entries: XenSplitLogEntry[];
  /** Every user the page's entries mention, including members who have since left */
  users: Record<string, { username: string; avatar: string | null }>;
  nextBefore: string | null;
}
