// Wire types for XenBudget. Kept beside the hooks (the XenSplit convention) rather than
// in src/client/types, and kept manually in sync with the mongoose schema in
// src/server/models/xenBudget.js and the zod schemas in src/server/utils/validation.ts.

export interface XenBudgetMember {
    user_id: string;
    username: string;
    avatar: string | null;
}

/**
 * One entry in either of a book's two registries. Same shape, different meaning:
 *   categories - what a purchase WAS. Budgets and reports run on these, and one purchase
 *                can split across several by weight.
 *   flags      - what needs ATTENTION. Unweighted; replaced the old flagged boolean.
 */
export interface XenBudgetLabel {
    _id: string;
    name: string;
    color?: string;
    /** Built-in flags the importer and rules refer to by name: no delete, no rename. */
    system?: boolean;
}

export type BudgetPeriod = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

/**
 * Which way a budget's amount points.
 *
 * `cap` is a ceiling on spending - passing it is the failure. `goal` is a floor: money
 * moved into a savings category, where reaching the amount is the point and passing it is
 * better still. Both are measured identically; only the comparison and the colours differ.
 */
export type BudgetKind = "cap" | "goal";

/** One person's limit nested inside a budget, sharing its categories, period and window. */
export interface XenBudgetSubBudget {
    _id: string;
    person_id: string;
    amount: number;
}

export interface XenBudgetBudget {
    _id: string;
    /** Empty = every category. */
    categories: string[];
    kind: BudgetKind;
    period: BudgetPeriod;
    /** The overall limit. Unset when the budget caps only the people in `sub_budgets`. */
    amount?: number;
    sub_budgets: XenBudgetSubBudget[];
    start_date?: string;
    end_date?: string;
    active: boolean;
}

export type RuleField =
    | "description" | "amount" | "flags" | "category" | "type" | "date" | "source";
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
    actions: RuleActions;
    stop_on_match: boolean;
}

export interface XenBudgetImportPreset {
    _id: string;
    name: string;
    column_map: {
        date?: string; description?: string; amount?: string;
        debit?: string; credit?: string; people?: string;
    };
    amount_mode: "signed" | "debit_credit";
    sign_convention: "negative_is_expense" | "positive_is_expense";
    date_format: string;
    has_header: boolean;
    skip_rows: number;
    default_categories: string[];
}

export interface XenBudgetBook {
    _id: string;
    name: string;
    default_currency: string;
    timezone: string;
    created_by: string;
    /** True when the caller owns the book — gates member management and deletion. */
    is_creator: boolean;
    members: XenBudgetMember[];
    categories: XenBudgetLabel[];
    flags: XenBudgetLabel[];
    budgets: XenBudgetBudget[];
    rules: XenBudgetRule[];
    import_presets: XenBudgetImportPreset[];
    archived: boolean;
    created_at: string;
    /** Non-excluded item count, supplied by the list and detail endpoints. */
    item_count?: number;
    /** Items waiting in the review queue (uncategorised only). */
    review_count?: number;
    /** Items flagged "Needs review" — surfaced as a quick filter. */
    needs_review_count?: number;
    /** Most recent non-excluded item's date, supplied by the list endpoint. Undefined
     *  when the book has no items yet. */
    last_item_at?: string;
}

export interface XenBudgetShare {
    user_id: string;
    amount: number;
    percentage?: number;
}

export type ItemType = "expense" | "income";
export type ShareType = "equal" | "exact" | "percent";

/** A category's resolved weight on one item. These sum to the item's amount. */
export interface XenBudgetCategoryWeight {
    name: string;
    amount: number;
    percentage?: number;
}

/** A receipt photo attached to an item. Only the GCS path is stored; display URLs are
 *  resolved on demand via the signed-URL endpoint (see useXenBudgetItemImageUrls). */
export interface XenBudgetItemImage {
    _id: string;
    gcs_path: string;
}

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
    /** Receipt photos, uploaded after the item is saved. */
    images?: XenBudgetItemImage[];
    /** What the purchase was, weighted. Empty means uncategorised. */
    categories: XenBudgetCategoryWeight[];
    category_split_type: ShareType;
    /** What needs attention. */
    flags: string[];
    share_type: ShareType;
    shares: XenBudgetShare[];
    excluded: boolean;
    excluded_reason?: string;
    applied_rule_ids: string[];
    manually_edited: boolean;
    source: "manual" | "csv" | "restore";
    /** Human-readable card/source name for imported items, e.g. "Chase Visa". */
    source_label?: string;
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
    archived?: boolean;
    timezone?: string;
}

export interface CreateItemInput {
    type?: ItemType;
    amount: number;
    currency?: string;
    date?: string;
    description: string;
    notes?: string;
    categories?: { name: string; amount?: number; percentage?: number }[];
    category_split_type?: ShareType;
    flags?: string[];
    share_type?: ShareType;
    shares?: { user_id: string; amount?: number; percentage?: number }[];
}

export type UpdateItemInput = Partial<CreateItemInput> & {
    excluded?: boolean;
};

export type RuleDisposition = "keep" | "exclude" | "skip";

export interface RuleActions {
    /** What the purchase was. Assigned an even split, so one category means 100%. */
    set_categories: string[];
    /** What needs attention. This is what the old flag action became. */
    add_flags: string[];
    remove_flags: string[];
    set_type: "expense" | "income" | null;
    set_people: string[];
    set_description?: string;
    disposition: RuleDisposition;
}

export interface RuleInput {
    name: string;
    enabled?: boolean;
    priority?: number;
    match: { mode: "all" | "any"; conditions: XenBudgetRuleCondition[] };
    actions: Partial<RuleActions>;
    stop_on_match?: boolean;
}

interface ReapplySide {
    categories: string[];
    flags: string[];
    excluded: boolean;
    description: string;
    type: ItemType;
}

export interface ReapplyChange {
    _id: string;
    description: string;
    before: ReapplySide;
    after: ReapplySide;
}

export interface ReapplyResult {
    dry_run: boolean;
    examined: number;
    changed: number;
    skipped_manually_edited: number;
    sample: ReapplyChange[];
}

export interface ImportPreviewRow {
    index: number;
    skipped: boolean;
    skipped_by?: string;
    original: { description: string; categories: string[]; type: ItemType; amount: number };
    item: {
        type: ItemType; amount: number; date: string; description: string;
        categories: string[]; flags: string[];
        excluded: boolean; excluded_reason?: string;
    };
}

export interface ImportPreviewResult {
    previews: ImportPreviewRow[];
    skipped: number;
    excluded: number;
    flagged: number;
}

export interface DuplicateMatch {
    index: number;
    existing: { _id: string; description: string; date: string; amount: number };
}

export interface XenBudgetImportBatch {
    _id: string;
    source_label: string;
    filename?: string;
    imported_at: string;
    imported_by: string;
    imported_by_name: string;
    /** Rows written at import time. */
    row_count: number;
    /** How many of them are still here — items may have been deleted individually since. */
    remaining: number;
}

export interface BulkImportResult {
    batch_id: string;
    created: number;
    excluded: number;
    uncategorised: number;
    duplicates: number;
    skipped: { index: number; rule: string }[];
    failed: { index: number; reason: string }[];
}

export interface PresetInput {
    name: string;
    column_map: XenBudgetImportPreset["column_map"];
    amount_mode?: "signed" | "debit_credit";
    sign_convention?: "negative_is_expense" | "positive_is_expense";
    date_format?: string;
    has_header?: boolean;
    skip_rows?: number;
    default_categories?: string[];
}

/** What one person put toward a budget's scope in its period. Sums to the budget's `spent`. */
export interface BudgetPersonSpend {
    user_id: string;
    username: string;
    amount: number;
}

/** A per-person limit, measured over its parent's scope and window. */
export interface SubBudgetStatus {
    _id: string;
    person_id: string;
    person_name: string;
    amount: number;
    spent: number;
    remaining: number;
    percent: number;
    over: boolean;
    item_count: number;
}

export interface BudgetStatus {
    _id: string;
    /** Empty = every category. */
    categories: string[];
    kind: BudgetKind;
    period: BudgetPeriod;
    /** What the scope spent this period, whether or not there is an overall limit. */
    spent: number;
    item_count: number;
    /**
     * The overall limit and its progress. All four are absent together when the budget
     * caps only the people in `sub_budgets` - `amount === undefined` is the one check
     * that decides whether there is an overall bar to draw.
     */
    amount?: number;
    remaining?: number;
    /** Uncapped, so the bar can show how far past the amount it went. */
    percent?: number;
    /** Literally `spent > amount`. Good on a goal, bad on a cap - see `kind`. */
    over?: boolean;
    /** Who spent it, biggest first. Empty when nothing was spent. */
    by_person: BudgetPersonSpend[];
    sub_budgets: SubBudgetStatus[];
    period_from: string;
    period_to: string;
}

export interface BudgetStatusResponse {
    as_of: string;
    currency: string;
    timezone: string;
    budgets: BudgetStatus[];
}

export interface BudgetInput {
    categories?: string[];
    /** Omit for a spending cap. */
    kind?: BudgetKind;
    period: BudgetPeriod;
    /** Omit to cap only the people in `sub_budgets`; one of the two is required. */
    amount?: number;
    sub_budgets?: { person_id: string; amount: number }[];
    start_date?: string;
    end_date?: string;
    active?: boolean;
}

export interface SummaryPeriod {
    /** "2026-08" | "2026-W34" | "2026-08-21", matching the requested group_by. */
    key: string;
    expense: number;
    income: number;
    net: number;
    count: number;
}

export interface SummaryCategory {
    category: string;
    total: number;
    count: number;
}

/** One category's spend in one period bucket - the report grid's cells. */
export interface SummaryCategoryPeriod {
    category: string;
    /** Matches a `by_period` key, so the two line up column for column. */
    key: string;
    total: number;
}

export interface SummaryPerson {
    user_id: string;
    username: string;
    avatar: string | null;
    /** Each person's share of the book's expenses for the period. */
    total: number;
    /** Each person's share of the book's income for the period. */
    income: number;
    count: number;
}

export interface XenBudgetSummary {
    from: string;
    to: string;
    group_by: "day" | "week" | "month";
    timezone: string;
    /** Summaries are scoped to one currency — amounts in different ones can't be added. */
    currency: string;
    /** Every currency present in the book, so the UI can offer a switcher. */
    currencies: string[];
    by_period: SummaryPeriod[];
    by_category: SummaryCategory[];
    /** by_category cut by period as well. Sums to by_category across all keys. */
    by_category_period: SummaryCategoryPeriod[];
    by_person: SummaryPerson[];
    uncategorised: { total: number; count: number };
    uncategorised_by_period: { key: string; total: number }[];
    totals: { expense: number; income: number; net: number; count: number };
}

export interface ItemsPage {
    items: XenBudgetItem[];
    next_cursor: string | null;
    has_more: boolean;
}
