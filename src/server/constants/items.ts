import { User } from "../models/user";
import { Item } from "../types/item";
import { GEM_PACKS, STORAGE_VOUCHER_BYTES, STORAGE_VOUCHER_KEY } from "@shared/monetization";

// Gem packs are items too. They never reach an inventory (the Shop adds them with addToInventory: false); the
// definition is what the Shop shows. The picture is drawn by the client, which knows the gem icon.
const GEM_PACK_ITEMS: Record<string, Item> = Object.fromEntries(
  GEM_PACKS.map((pack) => [
    pack.id,
    {
      key: pack.id,
      name: `${pack.gems.toLocaleString("en-US")} gems`,
      description: `Adds ${pack.gems.toLocaleString("en-US")} gems to your balance`,
      image: "",
      redeemable: false,
    },
  ]),
);

export const ITEMS: Record<string, Item> = {
  ...GEM_PACK_ITEMS,
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
    description: "A prestigious badge shown next to your name wherever people see it",
    image: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
    redeemable: false,
    cosmetic: { slot: "badge" },
  },
};
