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
}

export interface XenSplit {
  _id: string;
  name: string;
  default_currency: string;
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
}

export interface CreateXenSplitInput {
  name: string;
  memberIds?: string[];
  default_currency?: string;
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
}

export interface SettleDebtInput {
  from: string;
  to: string;
  amount: number;
  currency: string;
}