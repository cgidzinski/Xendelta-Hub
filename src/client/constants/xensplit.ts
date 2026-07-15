export const EXPENSE_CATEGORIES = [
  "Food & Drink",
  "Transport",
  "Utilities",
  "Entertainment",
  "Travel",
  "Lodging",
  "Shopping",
  "Healthcare",
  "Currency",
  "Other",
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
