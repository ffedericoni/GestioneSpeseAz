import { z } from "zod";
import { MONEY_CATEGORIES, type MoneyCategory } from "@gsa/shared";

// MILEAGE is intentionally excluded until Slice 3 (needs vehicle + ACI rate +
// distance provider). Sending MILEAGE here yields DATI_NON_VALIDI.
export const createItemSchema = z.object({
  category: z.enum(MONEY_CATEGORIES as unknown as [MoneyCategory, ...MoneyCategory[]]),
  date: z.coerce.date(),
  description: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  vatCents: z.number().int().nonnegative().nullish(),
  receiptRef: z.string().min(1).nullish(),
  notes: z.string().min(1).nullish(),
});

export const updateItemSchema = createItemSchema.partial();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
