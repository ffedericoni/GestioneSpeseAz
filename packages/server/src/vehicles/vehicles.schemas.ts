import { z } from "zod";

export const createVehicleSchema = z.object({
  label: z.string().min(1),
  aciRateId: z.string().min(1),
  plate: z.string().min(1).nullish(),
});

export const updateVehicleSchema = z.object({
  label: z.string().min(1).optional(),
  plate: z.string().min(1).nullish(),
  active: z.boolean().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
