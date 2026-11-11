import type { SvgIconProps } from "@mui/material";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import FreeBreakfastIcon from "@mui/icons-material/FreeBreakfast";
import LunchDiningIcon from "@mui/icons-material/LunchDining";
import DinnerDiningIcon from "@mui/icons-material/DinnerDining";
import RiceBowlIcon from "@mui/icons-material/RiceBowl";
import CookieIcon from "@mui/icons-material/Cookie";
import IcecreamIcon from "@mui/icons-material/Icecream";
import BakeryDiningIcon from "@mui/icons-material/BakeryDining";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import SoupKitchenIcon from "@mui/icons-material/SoupKitchen";
import GrassIcon from "@mui/icons-material/Grass";
import LocalPizzaIcon from "@mui/icons-material/LocalPizza";
import SetMealIcon from "@mui/icons-material/SetMeal";
import KebabDiningIcon from "@mui/icons-material/KebabDining";
import SpaIcon from "@mui/icons-material/Spa";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import CelebrationIcon from "@mui/icons-material/Celebration";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import MicrowaveIcon from "@mui/icons-material/Microwave";
import AirIcon from "@mui/icons-material/Air";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import OutdoorGrillIcon from "@mui/icons-material/OutdoorGrill";
import KitchenIcon from "@mui/icons-material/Kitchen";
import type { CategoryIcon, CookMethod } from "@shared/xenkitchen/kitchen";

export const CATEGORY_ICON_COMPONENTS: Record<CategoryIcon, React.ComponentType<SvgIconProps>> = {
  restaurant: RestaurantIcon,
  breakfast: FreeBreakfastIcon,
  lunch: LunchDiningIcon,
  dinner: DinnerDiningIcon,
  sides: RiceBowlIcon,
  snack: CookieIcon,
  dessert: IcecreamIcon,
  baking: BakeryDiningIcon,
  drink: LocalCafeIcon,
  frozen: AcUnitIcon,
  soup: SoupKitchenIcon,
  salad: GrassIcon,
  pizza: LocalPizzaIcon,
  fish: SetMealIcon,
  meat: KebabDiningIcon,
  vegetarian: SpaIcon,
  kids: ChildCareIcon,
  party: CelebrationIcon,
};

export function CategoryIconView({ icon, ...props }: { icon?: string } & SvgIconProps) {
  const Icon = CATEGORY_ICON_COMPONENTS[icon as CategoryIcon] ?? RestaurantIcon;
  return <Icon {...props} />;
}

export const METHOD_ICON_COMPONENTS: Record<CookMethod, React.ComponentType<SvgIconProps>> = {
  oven: WhatshotIcon,
  microwave: MicrowaveIcon,
  air_fryer: AirIcon,
  stovetop: LocalFireDepartmentIcon,
  grill: OutdoorGrillIcon,
  other: KitchenIcon,
};

export function MethodIconView({ method, ...props }: { method: CookMethod } & SvgIconProps) {
  const Icon = METHOD_ICON_COMPONENTS[method] ?? KitchenIcon;
  return <Icon {...props} />;
}
