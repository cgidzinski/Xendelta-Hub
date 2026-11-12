import { z } from "zod";

export const buyShopItemSchema = z.object({ itemId: z.string().min(1, "itemId is required").max(64) });
