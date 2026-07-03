import type { SvgIconComponent } from "@mui/icons-material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import BoltIcon from "@mui/icons-material/Bolt";
import MovieIcon from "@mui/icons-material/Movie";
import FlightIcon from "@mui/icons-material/Flight";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import CategoryIcon from "@mui/icons-material/Category";
import HouseIcon from "@mui/icons-material/House";
import type { ExpenseCategory } from "./xensplit";

export const CATEGORY_ICONS: Record<ExpenseCategory, SvgIconComponent> = {
  "Food & Drink": RestaurantIcon,
  Transport: DirectionsCarIcon,
  Utilities: BoltIcon,
  Entertainment: MovieIcon,
  Travel: FlightIcon,
  Lodging: HouseIcon,
  Shopping: ShoppingBagIcon,
  Healthcare: LocalHospitalIcon,
  Other: CategoryIcon,
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  "Food & Drink": "#fb923c",
  Transport: "#60a5fa",
  Utilities: "#facc15",
  Entertainment: "#c084fc",
  Travel: "#818cf8",
  Lodging: "#2dd4bf",
  Shopping: "#f472b6",
  Healthcare: "#f87171",
  Other: "#94a3b8",
};

/** Icon for an expense's category, falling back to the default receipt icon. */
export function getCategoryIcon(category?: string): SvgIconComponent {
  if (category && category in CATEGORY_ICONS) {
    return CATEGORY_ICONS[category as ExpenseCategory];
  }
  return ReceiptLongIcon;
}

/** Color for an expense's category, falling back to the "Other" color. */
export function getCategoryColor(category?: string): string {
  if (category && category in CATEGORY_COLORS) {
    return CATEGORY_COLORS[category as ExpenseCategory];
  }
  return CATEGORY_COLORS.Other;
}
