import { User } from "../models/user";
import { Item } from "../types/item";
import { STORAGE_VOUCHER_BYTES, STORAGE_VOUCHER_KEY } from "@shared/monetization";

export const ITEMS: Record<string, Item> = {
  // Retired when points became gems (#180); kept so vouchers people already hold still redeem.
  "1000-gem-voucher": {
    key: "1000-gem-voucher",
    name: "1000 Gem Voucher",
    description: "Redeem this voucher to get 1000 gems added to your account",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDjzenTPwlSFWa0lUXHTtHLoX18nv8D4fyTA&s",
    redeemable: true,
    legacy: true,
    apply: async (userId) => {
      await User.updateOne({ _id: userId }, { $inc: { gems: 1000 } }).exec();
    },
  },
  [STORAGE_VOUCHER_KEY]: {
    key: STORAGE_VOUCHER_KEY,
    name: "1GB XenDrive Voucher",
    description: "Redeem this voucher to get 1GB of XenDrive space added to your account",
    image: "https://cdn-icons-png.flaticon.com/512/4008/4008946.png",
    redeemable: true,
    apply: async (userId) => {
      await User.updateOne({ _id: userId }, { $inc: { "xendrive.spaceAllowed": STORAGE_VOUCHER_BYTES } }).exec();
    },
  },
  "golden-badge": {
    key: "golden-badge",
    name: "Golden Badge",
    description: "A prestigious badge to display on your profile",
    image: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
    redeemable: false,
  },
};
