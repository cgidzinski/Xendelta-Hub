import { z } from "zod";
import { GEM_PACK_IDS } from "@shared/monetization";

export const buyShopItemSchema = z.object({ itemId: z.string().min(1, "itemId is required").max(64) });
export const gemCheckoutSchema = z.object({ packId: z.enum(GEM_PACK_IDS) });
