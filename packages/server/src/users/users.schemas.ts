import { z } from "zod";
import { ROLES } from "../core/roles.js";

export const roleSchema = z.enum(ROLES);

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: roleSchema,
  managerId: z.string().cuid().nullish(),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: roleSchema.optional(),
  managerId: z.string().cuid().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
