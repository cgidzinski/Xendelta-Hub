export const EXPENSE_CATEGORIES = [
  "Food & Drink",
  "Transport",
  "Utilities",
  "Entertainment",
  "Travel",
  "Shopping",
  "Healthcare",
  "Other",
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
