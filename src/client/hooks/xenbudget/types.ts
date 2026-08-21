// Wire types for XenBudget. Kept beside the hooks (the XenSplit convention) rather than
// in src/client/types, and kept manually in sync with the mongoose schema in
// src/server/models/xenBudget.js and the zod schemas in src/server/utils/validation.ts.

export interface XenBudgetMember {
    user_id: string;
    username: string;
    avatar: string | null;
}

export interface XenBudgetTag {
    _id: string;
    name: string;
    color?: string;
}

export type BudgetScope = "all" | "tag" | "person";
export type BudgetPeriod = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export interface XenBudgetBudget {
    _id: string;
    scope: BudgetScope;
    tag?: string;
    person_id?: string;
    period: BudgetPeriod;
    amount: number;
    start_date?: string;
    end_date?: string;
    active: boolean;
}

export type RuleField = "description" | "amount" | "tags" | "type" | "date" | "source";
export type RuleOp =
    | "contains" | "not_contains" | "equals" | "starts_with" | "ends_with" | "regex"
    | "gt" | "gte" | "lt" | "lte" | "between" | "is_empty";

export interface XenBudgetRuleCondition {
    field: RuleField;
    op: RuleOp;
    value?: string;
    value2?: string;
    case_sensitive?: boolean;
}

export interface XenBudgetRule {
    _id: string;
    name: string;
    enabled: boolean;
    priority: number;
    match: { mode: "all" | "any"; conditions: XenBudgetRuleCondition[] };
    actions: {
        add_tags: string[];
        remove_tags: string[];
        set_type: "expense" | "income" | null;
        set_people: string[];
        set_description?: string;
        flag: boolean;
        flag_reason?: string;
        disposition: "keep" | "exclude" | "skip";
    };
    stop_on_match: boolean;
}

export interface XenBudgetImportPreset {
    _id: string;
    name: string;
    column_map: {
        date?: string; description?: string; amount?: string;
        debit?: string; credit?: string; tags?: string; people?: string;
    };
    amount_mode: "signed" | "debit_credit";
    sign_convention: "negative_is_expense" | "positive_is_expense";
    date_format: string;
    skip_rows: number;
    default_tags: string[];
}

export interface XenBudgetBook {
    _id: string;
    name: string;
    timezone: string;
    default_currency: string;
    created_by: string;
    /** True when the caller owns the book — gates member management and deletion. */
    is_creator: boolean;
    members: XenBudgetMember[];
    tags: XenBudgetTag[];
    budgets: XenBudgetBudget[];
    rules: XenBudgetRule[];
    import_presets: XenBudgetImportPreset[];
    archived: boolean;
    created_at: string;
    /** Non-excluded item count, supplied by the list and detail endpoints. */
    item_count?: number;
}

export interface XenBudgetShare {
    user_id: string;
    amount: number;
    percentage?: number;
}

export type ItemType = "expense" | "income";
export type ShareType = "equal" | "exact" | "percent";

export interface XenBudgetItem {
    _id: string;
    book_id: string;
    type: ItemType;
    /** Always positive; `type` carries the sign. */
    amount: number;
    currency: string;
    date: string;
    description: string;
    original_description?: string;
    notes?: string;
    tags: string[];
    share_type: ShareType;
    shares: XenBudgetShare[];
    excluded: boolean;
    excluded_reason?: string;
    flagged: boolean;
    flag_reason?: string;
    applied_rule_ids: string[];
    manually_edited: boolean;
    source: "manual" | "csv" | "restore";
    import_batch_id?: string;
    created_by: string;
    created_at: string;
}

export interface CreateBookInput {
    name: string;
    memberIds?: string[];
    default_currency?: string;
    timezone?: string;
}

export interface UpdateBookInput {
    name?: string;
    default_currency?: string;
    timezone?: string;
    archived?: boolean;
}

export interface CreateItemInput {
    type?: ItemType;
    amount: number;
    currency?: string;
    date?: string;
    description: string;
    notes?: string;
    tags?: string[];
    share_type?: ShareType;
    shares?: { user_id: string; amount?: number; percentage?: number }[];
}

export type UpdateItemInput = Partial<CreateItemInput> & {
    excluded?: boolean;
    flagged?: boolean;
};

export interface ItemsPage {
    items: XenBudgetItem[];
    next_cursor: string | null;
    has_more: boolean;
}
