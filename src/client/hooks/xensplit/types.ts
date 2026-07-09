export interface XenSplitMember {
  user_id: string;
  username: string;
  avatar: string | null;
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
  do_not_simplify?: boolean;
  created_at: string;
  payer?: {
    user_id: string;
    username: string;
    avatar: string | null;
  } | null;
}

export interface XenSplitSettlement {
  _id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  settled_at: string;
  is_partial?: boolean;
  note?: string;
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
  };
  toUser: {
    _id: string;
    username: string;
    avatar: string | null;
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
  kind: "paid" | "share" | "settlement";
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
  do_not_simplify?: boolean;
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
  do_not_simplify?: boolean;
}

export interface SettleDebtInput {
  from: string;
  to: string;
  amount: number;
  currency: string;
  note?: string;
}