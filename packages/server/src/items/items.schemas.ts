import { z } from "zod";
import { MONEY_CATEGORIES, type MoneyCategory } from "@gsa/shared";

// Money categories: direct amount in cents. Unchanged from earlier slices.
const moneyItemSchema = z.object({
  category: z.enum(MONEY_CATEGORIES as unknown as [MoneyCategory, ...MoneyCategory[]]),
  date: z.coerce.date(),
  description: z.string().min(1),
  amountCents: z.number().int().min(0).max(100_000_000),
  vatCents: z.number().int().min(0).max(100_000_000).nullish(),
  receiptRef: z.string().min(1).nullish(),
  notes: z.string().min(1).nullish(),
});

// MILEAGE: the server computes amountCents from the vehicle's ACI rate; the
// client never sends amountCents. enteredKm/manualKm are whole positive km.
const mileageItemSchema = z.object({
  category: z.literal("MILEAGE"),
  date: z.coerce.date(),
  description: z.string().min(1),
  vehicleId: z.string().min(1),
  originAddress: z.string().min(1),
  destinationAddress: z.string().min(1),
  roundTrip: z.boolean(),
  manualKm: z.number().int().min(1).max(10_000),
  enteredKm: z.number().int().min(1).max(10_000),
  overageJustification: z.string().min(1).nullish(),
  notes: z.string().min(1).nullish(),
});

export const createItemSchema = z.discriminatedUnion("category", [
  moneyItemSchema,
  mileageItemSchema,
]);

// Editing is money-only for now (no UI edits items; mileage edit is deferred,
// see the Slice 3b spec §2). A PATCH carrying MILEAGE/mileage fields fails here.
export const updateItemSchema = moneyItemSchema.partial();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
