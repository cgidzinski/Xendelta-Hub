import { Item } from "../types/item";

export const ITEMS: Record<string, Item> = {
  "1000-point-voucher": {
    key: "1000-point-voucher",
    name: "1000 Point Voucher",
    description: "Redeem this voucher to get 1000 points added to your account",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDjzenTPwlSFWa0lUXHTtHLoX18nv8D4fyTA&s",
    redeemable: true,
    apply: async (user: any) => {
      user.points += 1000;
      await user.save();
    }
  },
  "1gb-xenbox-voucher": {
    key: "1gb-xenbox-voucher",
    name: "1GB XenBox Voucher",
    description: "Redeem this voucher to get 1GB of XenBox space added to your account",
    image: "https://cdn-icons-png.flaticon.com/512/4008/4008946.png",
    redeemable: true,
    apply: async (user: any) => {
      user.xenbox.spaceAllowed += 1024 * 1024 * 1024;
      await user.save();
    }
  },
  "golden-badge": {
    key: "golden-badge",
    name: "Golden Badge",
    description: "A prestigious badge to display on your profile",
    image: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
    redeemable: false,
  },
};